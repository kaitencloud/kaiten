package database_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
)

// aiCreditsPrevious is the migration right before 20261019000000_ai_credits.
const aiCreditsPrevious = 20261016000000

// TestAICreditsMigration_AppliesWhetherOrNotBillingAddedTheKeysFirst: the
// migration adds entitlement_id_organization_id_key and
// instance_id_organization_id_key under feat/billing's exact names, guarded,
// so it applies on a database where billing's migration already created them
// and on one where it did not. The fresh case is every other test of the
// suite; this is the other one.
func TestAICreditsMigration_AppliesWhetherOrNotBillingAddedTheKeysFirst(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	connString := startPostgres(ctx, t)

	if err := database.RunMigrations(connString); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}
	if err := database.DownTo(ctx, connString, aiCreditsPrevious); err != nil {
		t.Fatalf("DownTo(%d) error = %v", aiCreditsPrevious, err)
	}

	pool, err := database.ConnectDB(connString)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	// The down kept the keys on purpose; drop them, then add them back the
	// way billing's migration does, unguarded, before ours runs again.
	for _, stmt := range []string{
		`ALTER TABLE "entitlement" DROP CONSTRAINT "entitlement_id_organization_id_key"`,
		`ALTER TABLE "instance" DROP CONSTRAINT "instance_id_organization_id_key"`,
		`ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_id_organization_id_key" UNIQUE ("id", "organization_id")`,
		`ALTER TABLE "instance" ADD CONSTRAINT "instance_id_organization_id_key" UNIQUE ("id", "organization_id")`,
	} {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}

	if err := database.RunMigrations(connString); err != nil {
		t.Fatalf("RunMigrations() over billing's keys error = %v", err)
	}
}

// TestAICreditsMigration_ACreditPoolAggregatesBySum pins
// entitlement_ai_credit_sum_check, independent of the application layer.
func TestAICreditsMigration_ACreditPoolAggregatesBySum(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	connString := startPostgres(ctx, t)
	if err := database.RunMigrations(connString); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}
	pool, err := database.ConnectDB(connString)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, `INSERT INTO organization (id, external_id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'o', 'o')`); err != nil {
		t.Fatal(err)
	}
	insert := `INSERT INTO entitlement (organization_id, name, slug, type, aggregation_method)
	           VALUES ('00000000-0000-0000-0000-000000000001', $1, $1, 'NUMBER_AI_CREDIT', $2)`
	if _, err := pool.Exec(ctx, insert, "pool-sum", "SUM"); err != nil {
		t.Fatalf("a SUM credit pool is refused: %v", err)
	}
	_, err = pool.Exec(ctx, insert, "pool-max", "MAX")
	if err == nil || !strings.Contains(err.Error(), "entitlement_ai_credit_sum_check") {
		t.Fatalf("a MAX credit pool: err = %v, want entitlement_ai_credit_sum_check", err)
	}
}

// Both snapshots must be present on a charged row: one NULL must not turn a
// corrupt accounting record into an accepted row.
func TestAICreditsMigration_ChargedRowsNeedBothBalanceSnapshots(t *testing.T) {
	for _, snapshots := range []struct {
		name   string
		before any
		after  any
	}{
		{"both present", 10.0, 11.0},
		{"before missing", nil, 11.0},
		{"after missing", 10.0, nil},
		{"both missing", nil, nil},
	} {
		t.Run(snapshots.name, func(t *testing.T) {
			withRollback(t, func(ctx context.Context, tx pgx.Tx) {
				organizationID := insertOrganization(ctx, t, tx, uuid.New())
				//nolint:dupword // Creation and settlement use the same fixture instant.
				_, err := tx.Exec(ctx, `INSERT INTO ai_inference (
					organization_id, instance_id, entitlement_id, transaction_id,
					status, reported_at, committed_at, model_ref, request_type,
					request_status, authorized, credits_charged, value_before, value_after, request_hash, commit_hash
				) VALUES ($1, $2, $3, 'charge', 'COMMITTED', now(), now(), 'model',
					'COMPLETION', 'SUCCESS', true, 1, $4, $5, decode(repeat('01',32),'hex'), decode(repeat('02',32),'hex'))`,
					organizationID, uuid.New(), uuid.New(), snapshots.before, snapshots.after)
				if snapshots.before != nil && snapshots.after != nil {
					if err != nil {
						t.Fatalf("valid charged row refused: %v", err)
					}
				} else {
					assertViolates(t, err, "ai_inference_charge_check")
				}
			})
		})
	}
}

func TestAICreditsMigration_ActiveRuleIdentities(t *testing.T) {
	for _, identity := range []struct {
		name       string
		model      bool
		request    any
		constraint string
	}{
		{"model and type", true, "COMPLETION", "ccr_active_model_type_key"},
		{"model only", true, nil, "ccr_active_model_key"},
		{"type only", false, "COMPLETION", "ccr_active_type_key"},
		{"any model and type", false, nil, "ccr_active_any_key"},
	} {
		t.Run(identity.name, func(t *testing.T) {
			withRollback(t, func(ctx context.Context, tx pgx.Tx) {
				organizationID := insertOrganization(ctx, t, tx, uuid.New())
				licenseID, entitlementID := uuid.New(), uuid.New()
				familyID := uuid.New()
				mustExec(ctx, t, tx, `INSERT INTO license_family (id, organization_id, slug)
					VALUES ($1, $2, 'family')`, familyID, organizationID)
				mustExec(ctx, t, tx, `INSERT INTO license (id, organization_id, name, slug, description, type, family_id, lifecycle_state)
					VALUES ($1, $2, 'License', 'license', '', 'PAID', $3, 'DRAFT')`, licenseID, organizationID, familyID)
				mustExec(ctx, t, tx, `INSERT INTO entitlement (id, organization_id, name, slug, type, aggregation_method)
					VALUES ($1, $2, 'Pool', 'pool', 'NUMBER_AI_CREDIT', 'SUM')`, entitlementID, organizationID)
				var modelID any
				if identity.model {
					modelID = uuid.New()
					mustExec(ctx, t, tx, `INSERT INTO model (id, organization_id, name, slug, vendor, modality, created_by_id, updated_by_id)
						VALUES ($1, $2, 'Model', 'model', 'vendor', 'TEXT', $3, $3)`, modelID, organizationID, platformIdentityID)
				}
				insert := `INSERT INTO credit_conversion_rule (
					organization_id, license_id, entitlement_id, model_id, request_type,
					rate_per_request, status, created_by_id, updated_by_id
				) VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $7)`
				args := []any{organizationID, licenseID, entitlementID, modelID, identity.request, "ACTIVE", platformIdentityID}
				mustExec(ctx, t, tx, insert, args...)
				// Archived copies do not occupy the identity. A replacement can
				// be created after archiving without deleting the old evidence.
				mustExec(ctx, t, tx, `UPDATE credit_conversion_rule SET status = 'ARCHIVED' WHERE license_id = $1`, licenseID)
				mustExec(ctx, t, tx, insert, args...)
				_, err := tx.Exec(ctx, insert, args...)
				assertViolates(t, err, identity.constraint)
			})
		})
	}
}

// Down removes the AI schema but intentionally leaves the shared composite
// keys: billing may reference them. Reapplying must reproduce the same schema.
func TestAICreditsMigration_RollbackAndReapply(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	connString := startPostgres(ctx, t)
	if err := database.RunMigrations(connString); err != nil {
		t.Fatal(err)
	}
	pool, err := database.ConnectDB(connString)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	before := schemaFingerprint(ctx, t, pool)
	if err := database.DownTo(ctx, connString, aiCreditsPrevious); err != nil {
		t.Fatal(err)
	}
	var remaining int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace
		AND relname IN ('model', 'model_external_id', 'credit_conversion_rule', 'ai_inference')`).Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 0 {
		t.Fatalf("rollback left %d AI tables", remaining)
	}
	if err := database.RunMigrations(connString); err != nil {
		t.Fatal(err)
	}
	if after := schemaFingerprint(ctx, t, pool); before != after {
		t.Fatal("schema changed after rolling back and reapplying the AI migration")
	}
}
