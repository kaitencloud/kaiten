package database_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
)

// perResourcePrevious is the migration right before
// 20261128110000_per_resource_entitlement.
const perResourcePrevious = 20261126120000

// TestPerResourceMigration_ExistingRowsReadInstance applies the migration over
// rows that were there before it: every entitlement -- the NUMBER family and the
// BOOLEAN and CONFIG rows the API never gives a scope to alike -- holds INSTANCE,
// the journal's rows name no resource, and no existing client sees a change.
func TestPerResourceMigration_ExistingRowsReadInstance(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	connString := startPostgres(ctx, t)
	require.NoError(t, database.RunMigrations(connString))
	require.NoError(t, database.DownTo(ctx, connString, perResourcePrevious))

	pool, err := database.ConnectDB(connString)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	organizationID := uuid.New()
	mustExecPool(ctx, t, pool, `INSERT INTO organization (id, external_id, name) VALUES ($1, 'org', 'org')`, organizationID)
	for slug, spec := range map[string][2]string{
		"seats": {"NUMBER", "SUM"}, "pool": {"NUMBER_AI_CREDIT", "SUM"}, "flag": {"BOOLEAN", ""}, "settings": {"CONFIG", ""},
	} {
		var aggregation *string
		if spec[1] != "" {
			aggregation = &spec[1]
		}
		mustExecPool(ctx, t, pool, `
			INSERT INTO entitlement (organization_id, name, slug, type, aggregation_method)
			VALUES ($1, $2, $2, $3, $4)`, organizationID, slug, spec[0], aggregation)
	}
	mustExecPool(ctx, t, pool, `
		INSERT INTO usage_ledger (organization_id, instance_id, entitlement_id, license_id, report_seq, reported_at,
		                          behavior, aggregation_method, reported_value, value_before, value_after,
		                          event_count_after, overage_percent, limit_value)
		VALUES ($1, $2, $3, $4, 1, date_trunc('milliseconds', now()::timestamp),
		        'append', 'SUM', 1, 0, 1, 1, 0, 10)`, organizationID, uuid.New(), uuid.New(), uuid.New())

	require.NoError(t, database.RunMigrations(connString))

	rows, err := pool.Query(ctx, `SELECT slug, limit_scope::text FROM entitlement ORDER BY slug`)
	require.NoError(t, err)
	defer rows.Close()
	scopes := map[string]string{}
	for rows.Next() {
		var slug, scope string
		require.NoError(t, rows.Scan(&slug, &scope))
		scopes[slug] = scope
	}
	require.NoError(t, rows.Err())
	require.Equal(t, map[string]string{"seats": "INSTANCE", "pool": "INSTANCE", "flag": "INSTANCE", "settings": "INSTANCE"}, scopes)

	var journalled, namedAResource int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*), count(resource_key) FROM usage_ledger`).Scan(&journalled, &namedAResource))
	require.Equal(t, 1, journalled, "the migration kept the journal's rows")
	require.Zero(t, namedAResource, "and none of them names a resource")
}

// The constraints of the per-resource tables, against a real Postgres: they are
// what holds when a writer other than the report path -- a seeder, a hand-run
// statement -- gets there.
func TestPerResourceMigration_Constraints(t *testing.T) {
	insertEntitlement := func(ctx context.Context, t *testing.T, tx pgx.Tx, entitlementType, scope string) error {
		t.Helper()
		organizationID := insertOrganization(ctx, t, tx, uuid.New())
		var aggregation *string
		if entitlementType == "NUMBER" || entitlementType == "NUMBER_AI_CREDIT" {
			sum := "SUM"
			aggregation = &sum
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO entitlement (organization_id, name, slug, type, aggregation_method, limit_scope)
			VALUES ($1, 'e', 'e', $2, $3, $4)`, organizationID, entitlementType, aggregation, scope)
		return err
	}

	t.Run("ANumberMayCountPerResource", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			require.NoError(t, insertEntitlement(ctx, t, tx, "NUMBER", "RESOURCE"))
		})
	})
	for _, entitlementType := range []string{"NUMBER_AI_CREDIT", "BOOLEAN", "CONFIG"} {
		t.Run(entitlementType+"MayNot", func(t *testing.T) {
			withRollback(t, func(ctx context.Context, tx pgx.Tx) {
				assertViolates(t, insertEntitlement(ctx, t, tx, entitlementType, "RESOURCE"), "entitlement_limit_scope_resource_check")
			})
		})
		t.Run(entitlementType+"CountsPerInstanceByDefault", func(t *testing.T) {
			withRollback(t, func(ctx context.Context, tx pgx.Tx) {
				require.NoError(t, insertEntitlement(ctx, t, tx, entitlementType, "INSTANCE"))
			})
		})
	}

	insertResource := func(ctx context.Context, tx pgx.Tx, key string, value string) error {
		// The key and the value are under test, not the foreign keys.
		if _, err := tx.Exec(ctx, `SET LOCAL session_replication_role = replica`); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO entitlement_resource_usage (entitlement_id, instance_id, resource_key, organization_id, value)
			VALUES ($3, $4, $1, $5, $2::jsonb)`, key, value, uuid.New(), uuid.New(), uuid.New())
		return err
	}
	const counter = `{"type":"number","value":1,"event_count":1}`

	for _, key := range []string{"x", strings.Repeat("a", 128), "A.b_c-d:9", "Stigg", "stigg", "...", ".hidden", "a..b"} {
		t.Run("TheKey_"+key[:min(len(key), 12)]+"_IsAccepted", func(t *testing.T) {
			withRollback(t, func(ctx context.Context, tx pgx.Tx) {
				require.NoError(t, insertResource(ctx, tx, key, counter))
			})
		})
	}
	for _, key := range []string{"", strings.Repeat("a", 129), "has space", "a/b", "café", ".", "..", "line\nbreak", "trailing\n"} {
		t.Run("TheKey_"+strings.NewReplacer("\n", "NL", " ", "_", "/", "_").Replace(key[:min(len(key), 12)])+"_IsRefused", func(t *testing.T) {
			withRollback(t, func(ctx context.Context, tx pgx.Tx) {
				assertViolates(t, insertResource(ctx, tx, key, counter), "entitlement_resource_usage_resource_key_check")
			})
		})
	}
	t.Run("AMalformedCounterIsRefused", func(t *testing.T) {
		for _, value := range []string{`{}`, `{"type":"number","value":1}`, `{"type":"boolean","value":true,"event_count":1}`, `{"type":"number","value":"1","event_count":1}`, `{"type":"number","value":1,"event_count":-1}`, `{"type":"number","value":1,"event_count":1.5}`} {
			withRollback(t, func(ctx context.Context, tx pgx.Tx) {
				assertViolates(t, insertResource(ctx, tx, "stigg", value), "entitlement_resource_usage_value_check")
			})
		}
	})
	t.Run("TheListOrderIsTheBytesOrderWhateverTheLocale", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			for _, key := range []string{"b", "a_1", "a", "B", "a-1", "A", "a.1"} {
				require.NoError(t, insertResource(ctx, tx, key, counter))
			}
			rows, err := tx.Query(ctx, `SELECT resource_key FROM entitlement_resource_usage ORDER BY resource_key`)
			require.NoError(t, err)
			defer rows.Close()
			var keys []string
			for rows.Next() {
				var key string
				require.NoError(t, rows.Scan(&key))
				keys = append(keys, key)
			}
			require.NoError(t, rows.Err())
			require.Equal(t, []string{"A", "B", "a", "a-1", "a.1", "a_1", "b"}, keys)
		})
	})

	insertReport := func(ctx context.Context, tx pgx.Tx, key *string) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO usage_ledger (organization_id, instance_id, entitlement_id, license_id, report_seq, reported_at,
			                          behavior, aggregation_method, reported_value, value_before, value_after,
			                          event_count_after, overage_percent, limit_value, resource_key)
			VALUES ($2, $3, $4, $5, 1,
			        date_trunc('milliseconds', now()::timestamp), 'append', 'SUM', 1, 0, 1, 1, 0, 10, $1)`,
			key, uuid.New(), uuid.New(), uuid.New(), uuid.New())
		return err
	}
	t.Run("TheJournalTakesAResourceOrNone", func(t *testing.T) {
		for _, key := range []*string{nil, ptrTo("stigg"), ptrTo("A.b_c-d:9")} {
			withRollback(t, func(ctx context.Context, tx pgx.Tx) {
				_, err := tx.Exec(ctx, `SET LOCAL session_replication_role = replica`)
				require.NoError(t, err)
				require.NoError(t, insertReport(ctx, tx, key))
			})
		}
	})
	t.Run("TheJournalRefusesAMalformedResource", func(t *testing.T) {
		for _, key := range []string{"", "..", ".", "has space", "a/b", strings.Repeat("a", 129)} {
			withRollback(t, func(ctx context.Context, tx pgx.Tx) {
				_, err := tx.Exec(ctx, `SET LOCAL session_replication_role = replica`)
				require.NoError(t, err)
				assertViolates(t, insertReport(ctx, tx, &key), "usage_ledger_resource_key_check")
			})
		}
	})
}

func ptrTo[T any](v T) *T { return &v }
