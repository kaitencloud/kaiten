// The invariants 20260818000000_platform_identity_and_tokens.sql adds, asserted
// against a real Postgres.
//
// These are database invariants rather than handler behaviour on purpose: an
// orgless credential is a privileged state, and every layer above this one --
// the credential-class declaration, the GetUser refusal, the queries' F6
// predicate -- is defence in depth on top of what is enforced here. So the tests
// exercise the constraints and triggers directly, with raw SQL, the way a future
// migration or a hand-run UPDATE would.
package database_test

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
)

// platformIdentityID is the row the migration pins. Application code never uses
// this literal -- every query resolves the identity by external_id -- but
// token_platform_is_orgless_system does, because "the owner is system:kaiten"
// cannot be a subquery inside a CHECK. So the tests use it too.
const platformIdentityID = "00000000-0000-0000-0000-000000000001"

const platformIdentityExternalID = "system:kaiten"

// platformMigrationVersion is the migration these tests cover.
const platformMigrationVersion int64 = 20260818000000

func TestPlatformIdentityRow(t *testing.T) {
	ctx := context.Background()
	pool := migratedPool(t)

	// Created by the migration, not by the seeder: it has to exist before the
	// first start of the application and before any organization, which is what
	// makes the membership trigger reliable from the very first tenant.
	t.Run("is an orgless machine user that kept its name and address", func(t *testing.T) {
		var (
			id, externalID, name, slug, userType string
			email                                *string
			organizationID                       *uuid.UUID
			deletedAt                            *time.Time
		)
		err := pool.QueryRow(ctx, `
			SELECT id, external_id, name, slug, type::text, email, organization_id, deleted_at
			FROM "user" WHERE external_id = $1`, platformIdentityExternalID).
			Scan(&id, &externalID, &name, &slug, &userType, &email, &organizationID, &deletedAt)
		require.NoError(t, err, "the platform identity must exist immediately after migrate up")

		assert.Equal(t, platformIdentityID, id)
		assert.Equal(t, "machine", userType, "it is a service account, not a person")
		assert.Equal(t, "Kaiten", name)
		require.NotNil(t, email)
		assert.Equal(t, "system@kaiten.sh", *email)
		assert.Equal(t, platformIdentityExternalID, slug,
			"the slug carries a colon, which the service-account slug pattern forbids -- "+
				"no tenant can create a service account that collides with it")
		assert.Nil(t, organizationID, "the platform identity belongs to no organization")
		assert.Nil(t, deletedAt)
	})

	// user_email_key is UNIQUE, so storing the address reserves it: a human
	// JIT-provisioning with it gets 409 Auth.EmailAlreadyProvisioned from
	// resolveUser's collision branch instead of colliding with the platform.
	t.Run("reserves system@kaiten.sh", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			_, err := tx.Exec(ctx,
				`INSERT INTO "user" (external_id, name, email) VALUES ('someone', 'Someone', 'system@kaiten.sh')`)

			assertViolates(t, err, "user_email_key")
		})
	})
}

// Every platform credential resolves through this one row, and both lookup
// queries filter u.deleted_at IS NULL, so a single DELETE /users/{id} would
// silently kill all of them at once.
func TestPlatformIdentityIsPermanent(t *testing.T) {
	t.Run("cannot be soft-deleted", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			_, err := tx.Exec(ctx,
				`UPDATE "user" SET deleted_at = now() WHERE external_id = $1`, platformIdentityExternalID)

			assertRaised(t, err, "platform identity cannot be deleted")
		})
	})

	t.Run("its membership cannot be soft-deleted", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := insertOrganization(ctx, t, tx, uuid.New())

			_, err := tx.Exec(ctx, `
				UPDATE user_on_organization SET deleted_at = now()
				WHERE organization_id = $1 AND user_id = $2`, organizationID, platformIdentityID)

			assertRaised(t, err, "membership cannot be removed")
		})
	})

	// The one permitted way for the membership to go. It is a hard DELETE through
	// user_on_organization_organization_id_fkey's ON DELETE CASCADE, which the
	// BEFORE UPDATE trigger above does not see -- so the tenant-deletion path,
	// and the seeder's organization cleanup, keep working.
	t.Run("but deleting the organization does remove it", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := insertOrganization(ctx, t, tx, uuid.New())

			mustExec(ctx, t, tx, `DELETE FROM organization WHERE id = $1`, organizationID)

			assert.Zero(t, countMemberships(ctx, t, tx, organizationID))
		})
	})

	// The protect triggers fire for one external id. Without these controls a
	// trigger that rejected every soft delete would look identical.
	t.Run("ordinary users and memberships are untouched", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := insertOrganization(ctx, t, tx, uuid.New())
			userID := uuid.New()
			mustExec(ctx, t, tx,
				`INSERT INTO "user" (id, external_id, name) VALUES ($1, $2, 'A Person')`,
				userID, "person-"+userID.String())
			mustExec(ctx, t, tx,
				`INSERT INTO user_on_organization (organization_id, user_id) VALUES ($1, $2)`,
				organizationID, userID)

			mustExec(ctx, t, tx, `
				UPDATE user_on_organization SET deleted_at = now()
				WHERE organization_id = $1 AND user_id = $2`, organizationID, userID)
			mustExec(ctx, t, tx, `UPDATE "user" SET deleted_at = now() WHERE id = $1`, userID)
		})
	})
}

func TestSystemMembershipTrigger(t *testing.T) {
	t.Run("every new organization gets one", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := insertOrganization(ctx, t, tx, uuid.New())

			assert.Equal(t, 1, countSystemMemberships(ctx, t, tx, organizationID))
		})
	})

	// The trigger used to guard on NEW."id" <> '...0001' -- comparing the
	// organization being inserted against the system *user's* id constant. That
	// uuid is also TMNT HQ's organization id in dev data, so that one tenant
	// silently never got a membership, and nothing platform-wide could act in it.
	t.Run("including an organization whose id is the system user's", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := insertOrganization(ctx, t, tx, uuid.MustParse(platformIdentityID))

			assert.Equal(t, 1, countSystemMemberships(ctx, t, tx, organizationID))
		})
	})

	// The membership is what CreateSystemOrganizationToken resolves inside its
	// INSERT, so a resurrected organization must come back mintable-into rather
	// than silently 409ing.
	t.Run("revives a soft-deleted membership on re-insert", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := uuid.New()
			insertOrganization(ctx, t, tx, organizationID)
			mustExec(ctx, t, tx, `ALTER TABLE user_on_organization DISABLE TRIGGER trg_protect_kaiten_system_membership`)
			mustExec(ctx, t, tx, `
				UPDATE user_on_organization SET deleted_at = now()
				WHERE organization_id = $1 AND user_id = $2`, organizationID, platformIdentityID)
			mustExec(ctx, t, tx, `ALTER TABLE user_on_organization ENABLE TRIGGER trg_protect_kaiten_system_membership`)
			mustExec(ctx, t, tx, `DELETE FROM organization WHERE id = $1`, organizationID)

			insertOrganization(ctx, t, tx, organizationID)

			assert.Equal(t, 1, countSystemMemberships(ctx, t, tx, organizationID))
		})
	})
}

// The migration relaxes two CHECK constraints on "user". Both are keyed on one
// external id and nothing else, so a tenant service account still cannot be
// orgless and still cannot have an email address. These are the tests that say
// the relaxations did not widen anything.
func TestMachineUserConstraintsWereNotWidened(t *testing.T) {
	cases := []struct {
		name string
		// namesAnOrganization is true when values references $1, which is the
		// organization the fixture creates -- the orgless case has no $1 at all.
		namesAnOrganization bool
		columns             string
		values              string
		constraint          string
	}{
		{
			name:                "a machine user still needs a slug",
			namesAnOrganization: true,
			columns:             `external_id, name, type, organization_id`,
			values:              `'sa-no-slug', 'SA', 'machine', $1`,
			constraint:          "user_slug_machine_check",
		},
		{
			name:                "a machine user still cannot have an email",
			namesAnOrganization: true,
			columns:             `external_id, name, slug, type, email, organization_id`,
			values:              `'sa-email', 'SA', 'sa-email', 'machine', 'sa@example.com', $1`,
			constraint:          "user_email_machine_check",
		},
		{
			// The exemption is on external_id = 'system:kaiten', not on
			// type = 'machine' AND organization_id IS NULL. Nothing else gets in.
			name:       "another machine user still cannot be orgless",
			columns:    `external_id, name, slug, type, organization_id`,
			values:     `'sa-orgless', 'SA', 'sa-orgless', 'machine', NULL`,
			constraint: "user_organization_id_machine_check",
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			withRollback(t, func(ctx context.Context, tx pgx.Tx) {
				var args []any
				if testCase.namesAnOrganization {
					args = append(args, insertOrganization(ctx, t, tx, uuid.New()))
				}

				_, err := tx.Exec(ctx,
					`INSERT INTO "user" (`+testCase.columns+`) VALUES (`+testCase.values+`)`, args...)

				assertViolates(t, err, testCase.constraint)
			})
		})
	}

	// idx_unique_machine_slug_per_org is ON (slug, organization_id), so it stops
	// enforcing anything once organization_id is NULL -- NULLs are distinct in a
	// unique index. idx_unique_orgless_machine_slug covers that gap.
	//
	// Reaching it requires two orgless machine users, which the CHECK above makes
	// impossible today: the index is what will keep slugs unique if a second
	// exemption is ever added. Dropping the constraint inside a transaction that
	// is rolled back is the only way to assert it does its job, and is the point
	// of having it at all.
	t.Run("orgless machine slugs are unique", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			mustExec(ctx, t, tx, `ALTER TABLE "user" DROP CONSTRAINT user_organization_id_machine_check`)

			_, err := tx.Exec(ctx, `
				INSERT INTO "user" (external_id, name, slug, type, organization_id)
				VALUES ('impostor', 'Impostor', $1, 'machine', NULL)`, platformIdentityExternalID)

			assertViolates(t, err, "idx_unique_orgless_machine_slug")
		})
	})
}

// organization_id IS NULL <=> kind = 'platform' AND the owner is system:kaiten.
// Orgless is a privileged, checked state, not a consequence of a nullable column.
func TestPlatformTokenConstraints(t *testing.T) {
	t.Run("a platform token is orgless and owned by the platform identity", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			require.NoError(t, insertToken(ctx, tx, tokenRow{
				kind:             "platform",
				serviceAccountID: uuid.MustParse(platformIdentityID),
			}))
		})
	})

	t.Run("a platform token cannot carry an organization", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := insertOrganization(ctx, t, tx, uuid.New())

			err := insertToken(ctx, tx, tokenRow{
				kind:             "platform",
				serviceAccountID: uuid.MustParse(platformIdentityID),
				organizationID:   &organizationID,
			})

			assertViolates(t, err, "token_platform_is_orgless_system")
		})
	})

	// The other direction, and the one that matters for the ~570 unguarded
	// .OrganizationID dereferences: an ordinary token can never become orgless.
	t.Run("an organization token cannot be orgless", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := insertOrganization(ctx, t, tx, uuid.New())
			serviceAccountID := insertServiceAccount(ctx, t, tx, organizationID)

			err := insertToken(ctx, tx, tokenRow{kind: "organization", serviceAccountID: serviceAccountID})

			assertViolates(t, err, "token_platform_is_orgless_system")
		})
	})

	t.Run("nobody but the platform identity may own a platform token", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := insertOrganization(ctx, t, tx, uuid.New())
			serviceAccountID := insertServiceAccount(ctx, t, tx, organizationID)

			err := insertToken(ctx, tx, tokenRow{kind: "platform", serviceAccountID: serviceAccountID})

			assertViolates(t, err, "token_platform_is_orgless_system")
		})
	})

	// No self-issuance: kaiten-admin-tools is the only issuer of platform tokens,
	// so a platform token can never appear as another one's child.
	t.Run("a platform token cannot have a parent", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			parentID := uuid.New()
			require.NoError(t, insertToken(ctx, tx, tokenRow{
				id:               parentID,
				kind:             "platform",
				serviceAccountID: uuid.MustParse(platformIdentityID),
			}))

			err := insertToken(ctx, tx, tokenRow{
				kind:             "platform",
				serviceAccountID: uuid.MustParse(platformIdentityID),
				issuedBy:         &parentID,
			})

			assertViolates(t, err, "token_platform_has_no_parent")
		})
	})

	// token_name is (service_account_id, name, organization_id) and token_slug is
	// (slug, organization_id): both stop enforcing anything once organization_id
	// is NULL. These partial indexes are what make two concurrent bootstrap Jobs
	// resolve deterministically at the database rather than through a
	// check-then-act race in the CLI.
	t.Run("two active platform tokens cannot share a name", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			require.NoError(t, insertToken(ctx, tx, tokenRow{
				kind: "platform", serviceAccountID: uuid.MustParse(platformIdentityID), name: "bootstrap",
			}))

			err := insertToken(ctx, tx, tokenRow{
				kind: "platform", serviceAccountID: uuid.MustParse(platformIdentityID), name: "bootstrap",
			})

			assertViolates(t, err, "uq_token_platform_name_active")
		})
	})

	// Rotation is create-new, roll consumers, revoke-old, so the name has to be
	// reusable once the old credential is retired.
	t.Run("but a revoked one releases its name", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			revokedAt := time.Now()
			require.NoError(t, insertToken(ctx, tx, tokenRow{
				kind: "platform", serviceAccountID: uuid.MustParse(platformIdentityID),
				name: "bootstrap", revokedDate: &revokedAt,
			}))

			require.NoError(t, insertToken(ctx, tx, tokenRow{
				kind: "platform", serviceAccountID: uuid.MustParse(platformIdentityID), name: "bootstrap",
			}))
		})
	})

	// Slugs address a token in the API, so unlike names they stay unique for the
	// lifetime of the row, revoked or not.
	t.Run("platform token slugs are unique forever", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			revokedAt := time.Now()
			require.NoError(t, insertToken(ctx, tx, tokenRow{
				kind: "platform", serviceAccountID: uuid.MustParse(platformIdentityID),
				slug: "system-kaiten-1", revokedDate: &revokedAt,
			}))

			err := insertToken(ctx, tx, tokenRow{
				kind: "platform", serviceAccountID: uuid.MustParse(platformIdentityID),
				slug: "system-kaiten-1",
			})

			assertViolates(t, err, "uq_token_platform_slug")
		})
	})
}

// The fresh-database path is covered by every test above, which runs against a
// container migrated from nothing. This is the other one: a database that
// already carries the human row the seeder used to write.
func TestMigrationConvergesAPreExistingDatabase(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 240*time.Second)
	defer cancel()

	connString, terminate, err := startPostgresContainer(ctx)
	require.NoError(t, err)
	t.Cleanup(terminate)

	require.NoError(t, database.RunMigrations(connString))

	pool, err := database.ConnectDB(connString)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	// Down restores the row to the shape the seeder left it in -- type 'human',
	// no slug -- and restores the buggy INSERT-only trigger with it, which is
	// what makes the rest of this test a faithful "upgrade an existing database".
	require.NoError(t, database.DownTo(ctx, connString, platformMigrationVersion-1))

	var userType string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT type::text FROM "user" WHERE external_id = $1`, platformIdentityExternalID).Scan(&userType))
	require.Equal(t, "human", userType, "the fixture for this test is the pre-migration shape")

	// The organization the old trigger skipped: its id is the system user's id
	// constant, which the guard compared against.
	skippedID := uuid.MustParse(platformIdentityID)
	mustExecPool(ctx, t, pool,
		`INSERT INTO organization (id, external_id, name) VALUES ($1, 'skipped', 'TMNT HQ')`, skippedID)
	require.Zero(t, countSystemMembershipsPool(ctx, t, pool, skippedID),
		"this test is worthless if the old trigger did not actually skip it")

	// And one whose membership was removed by hand. Nothing in the reverted
	// schema stops that, which is exactly why the backfill is not optional.
	strippedID := uuid.New()
	mustExecPool(ctx, t, pool,
		`INSERT INTO organization (id, external_id, name) VALUES ($1, 'stripped', 'Stripped')`, strippedID)
	mustExecPool(ctx, t, pool, `DELETE FROM user_on_organization WHERE organization_id = $1`, strippedID)

	require.NoError(t, database.RunMigrations(connString))

	t.Run("converts the human row without losing its identity", func(t *testing.T) {
		var (
			name, slug     string
			email          *string
			organizationID *uuid.UUID
		)
		require.NoError(t, pool.QueryRow(ctx, `
			SELECT type::text, name, slug, email, organization_id
			FROM "user" WHERE external_id = $1`, platformIdentityExternalID).
			Scan(&userType, &name, &slug, &email, &organizationID))

		assert.Equal(t, "machine", userType)
		assert.Equal(t, "Kaiten", name)
		assert.Equal(t, platformIdentityExternalID, slug)
		require.NotNil(t, email)
		assert.Equal(t, "system@kaiten.sh", *email)
		assert.Nil(t, organizationID)
	})

	t.Run("backfills the organizations that had no membership", func(t *testing.T) {
		assert.Equal(t, 1, countSystemMembershipsPool(ctx, t, pool, skippedID),
			"the organization the buggy trigger skipped must not stay unreachable")
		assert.Equal(t, 1, countSystemMembershipsPool(ctx, t, pool, strippedID))
	})
}

// --- fixtures -------------------------------------------------------------

type tokenRow struct {
	id               uuid.UUID
	kind             string
	serviceAccountID uuid.UUID
	organizationID   *uuid.UUID
	name             string
	slug             string
	issuedBy         *uuid.UUID
	revokedDate      *time.Time
}

// insertToken writes one token row and returns the database's verdict, filling in
// whatever the caller did not name so each test states only the columns its
// constraint is about.
func insertToken(ctx context.Context, tx pgx.Tx, row tokenRow) error {
	if row.id == uuid.Nil {
		row.id = uuid.New()
	}
	if row.name == "" {
		row.name = "token-" + row.id.String()
	}
	if row.slug == "" {
		row.slug = "slug-" + row.id.String()
	}

	_, err := tx.Exec(ctx, `
		INSERT INTO token (id, name, slug, hash, lookup_hash, created_by, service_account_id,
		                   organization_id, kind, issued_by_platform_token_id, revoked_date)
		VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10)`,
		row.id, row.name, row.slug, "hash-"+row.id.String(), "lookup-"+row.id.String(),
		row.serviceAccountID, row.organizationID, row.kind, row.issuedBy, row.revokedDate)

	return err
}

// insertOrganization creates a tenant. The AFTER INSERT trigger gives
// system:kaiten its membership, so callers get that for free -- which is the
// point of the trigger.
func insertOrganization(ctx context.Context, t *testing.T, tx pgx.Tx, id uuid.UUID) uuid.UUID {
	t.Helper()

	mustExec(ctx, t, tx,
		`INSERT INTO organization (id, external_id, name) VALUES ($1, $2, 'Tenant')`,
		id, "org-"+id.String())

	return id
}

func insertServiceAccount(ctx context.Context, t *testing.T, tx pgx.Tx, organizationID uuid.UUID) uuid.UUID {
	t.Helper()

	id := uuid.New()
	mustExec(ctx, t, tx, `
		INSERT INTO "user" (id, external_id, name, slug, type, organization_id)
		VALUES ($1, $2, 'Service Account', $3, 'machine', $4)`,
		id, "sa-"+id.String(), "sa-"+id.String(), organizationID)
	mustExec(ctx, t, tx,
		`INSERT INTO user_on_organization (organization_id, user_id) VALUES ($1, $2)`,
		organizationID, id)

	return id
}

func countSystemMemberships(ctx context.Context, t *testing.T, tx pgx.Tx, organizationID uuid.UUID) int {
	t.Helper()

	var count int
	require.NoError(t, tx.QueryRow(ctx, `
		SELECT count(*) FROM user_on_organization uoo
		       JOIN "user" u ON u.id = uoo.user_id
		WHERE uoo.organization_id = $1 AND u.external_id = $2 AND uoo.deleted_at IS NULL`,
		organizationID, platformIdentityExternalID).Scan(&count))

	return count
}

func countSystemMembershipsPool(ctx context.Context, t *testing.T, pool *pgxpool.Pool, organizationID uuid.UUID) int {
	t.Helper()

	var count int
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT count(*) FROM user_on_organization uoo
		       JOIN "user" u ON u.id = uoo.user_id
		WHERE uoo.organization_id = $1 AND u.external_id = $2 AND uoo.deleted_at IS NULL`,
		organizationID, platformIdentityExternalID).Scan(&count))

	return count
}

func countMemberships(ctx context.Context, t *testing.T, tx pgx.Tx, organizationID uuid.UUID) int {
	t.Helper()

	var count int
	require.NoError(t, tx.QueryRow(ctx,
		`SELECT count(*) FROM user_on_organization WHERE organization_id = $1`, organizationID).Scan(&count))

	return count
}

// --- harness --------------------------------------------------------------

var (
	sharedOnce      sync.Once
	sharedPool      *pgxpool.Pool
	sharedErr       error
	sharedTerminate func()
)

func TestMain(m *testing.M) {
	code := m.Run()

	if sharedPool != nil {
		sharedPool.Close()
	}
	if sharedTerminate != nil {
		sharedTerminate()
	}

	os.Exit(code)
}

// migratedPool returns a pool onto a database at the current schema version,
// started once for the whole package. The constraint tests never commit -- each
// runs in a transaction that is rolled back -- so they share it without needing
// a snapshot restore between them, and the round-trip test keeps its own
// container because it migrates the schema out from under itself.
func migratedPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	sharedOnce.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
		defer cancel()

		var connString string
		connString, sharedTerminate, sharedErr = startPostgresContainer(ctx)
		if sharedErr != nil {
			return
		}
		if sharedErr = database.RunMigrations(connString); sharedErr != nil {
			return
		}
		sharedPool, sharedErr = database.ConnectDB(connString)
	})
	require.NoError(t, sharedErr)

	return sharedPool
}

// withRollback hands fn a transaction that is always rolled back. A rejected
// statement aborts its transaction, so the statement under test has to be fn's
// last -- which also keeps each subtest to one assertion.
func withRollback(t *testing.T, fn func(ctx context.Context, tx pgx.Tx)) {
	t.Helper()

	ctx := context.Background()
	tx, err := migratedPool(t).Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()

	fn(ctx, tx)
}

func mustExec(ctx context.Context, t *testing.T, tx pgx.Tx, sql string, args ...any) {
	t.Helper()

	_, err := tx.Exec(ctx, sql, args...)
	require.NoError(t, err, "fixture statement failed: %s", sql)
}

func mustExecPool(ctx context.Context, t *testing.T, pool *pgxpool.Pool, sql string, args ...any) {
	t.Helper()

	_, err := pool.Exec(ctx, sql, args...)
	require.NoError(t, err, "fixture statement failed: %s", sql)
}

// assertViolates asserts the statement was rejected by one specific constraint or
// unique index. Naming it matters: without that, a test would pass just as
// happily on a typo in its own SQL.
func assertViolates(t *testing.T, err error, constraint string) {
	t.Helper()

	var pgErr *pgconn.PgError
	require.ErrorAs(t, err, &pgErr, "the database accepted a row it must reject")
	assert.Equal(t, constraint, pgErr.ConstraintName,
		"rejected, but by %s: %s", pgErr.Code, pgErr.Message)
}

// assertRaised asserts one of the protect triggers stopped the statement. They
// RAISE with restrict_violation rather than failing a constraint, which is what
// deleteuser and deletemembership translate into a 403.
func assertRaised(t *testing.T, err error, wantMessage string) {
	t.Helper()

	var pgErr *pgconn.PgError
	require.ErrorAs(t, err, &pgErr, "the database accepted a delete it must refuse")
	assert.Equal(t, "23001", pgErr.Code, "restrict_violation is what the handlers map to 403")
	assert.Contains(t, pgErr.Message, wantMessage)
}
