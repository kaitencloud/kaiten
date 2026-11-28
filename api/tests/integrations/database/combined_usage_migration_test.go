package database_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
)

// combinedUsagePrevious is the migration right before
// 20261128100000_entitlement_usage_source_and_sources.
const combinedUsagePrevious = 20261126120000

// TestCombinedUsageMigration_ABackfilledDatabaseHoldsEveryEntitlementAsCalculated
// upgrades a database that has entitlements of every type, written before the
// column existed: each is CALCULATED_USAGE, which is what no existing client has
// to change for. It then proves the way back: Down refuses while a combined
// entitlement exists, and leaves nothing behind once none does.
func TestCombinedUsageMigration_ABackfilledDatabaseHoldsEveryEntitlementAsCalculated(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 240*time.Second)
	defer cancel()
	connString := startPostgres(ctx, t)

	require.NoError(t, database.RunMigrations(connString))
	require.NoError(t, database.DownTo(ctx, connString, combinedUsagePrevious))

	pool, err := database.ConnectDB(connString)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	var before int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.columns
		WHERE table_name = 'entitlement' AND column_name = 'usage_source'`).Scan(&before))
	require.Zero(t, before, "the database is at the version before the migration")

	organizationID := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO organization (id, external_id, name) VALUES ($1, 'combined-migration', 'Tenant')`, organizationID)
	require.NoError(t, err)
	for _, entitlement := range []struct{ slug, kind, aggregation string }{
		{"seats", "NUMBER", "SUM"}, {"credits-pool", "NUMBER_AI_CREDIT", "SUM"}, {"sso", "BOOLEAN", ""}, {"limits", "CONFIG", ""},
	} {
		var aggregation any
		if entitlement.aggregation != "" {
			aggregation = entitlement.aggregation
		}
		_, err = pool.Exec(ctx, `INSERT INTO entitlement (organization_id, name, slug, type, aggregation_method) VALUES ($1, $2, $2, $3, $4)`,
			organizationID, entitlement.slug, entitlement.kind, aggregation)
		require.NoError(t, err)
	}

	require.NoError(t, database.RunMigrations(connString), "the upgrade of a database that already holds entitlements")

	rows, err := pool.Query(ctx, `SELECT slug, usage_source::text FROM entitlement WHERE organization_id = $1 ORDER BY slug`, organizationID)
	require.NoError(t, err)
	stored := map[string]string{}
	for rows.Next() {
		var slug, source string
		require.NoError(t, rows.Scan(&slug, &source))
		stored[slug] = source
	}
	require.NoError(t, rows.Err())
	assert.Equal(t, map[string]string{
		"seats": "CALCULATED_USAGE", "credits-pool": "CALCULATED_USAGE", "sso": "CALCULATED_USAGE", "limits": "CALCULATED_USAGE",
	}, stored, "every entitlement written before the column is calculated")

	var links int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM entitlement_source`).Scan(&links))
	assert.Zero(t, links)

	// A combined entitlement exists now, and the way back refuses to lose it.
	_, err = pool.Exec(ctx, `INSERT INTO entitlement (organization_id, name, slug, type, aggregation_method, usage_source)
		VALUES ($1, 'combined', 'combined', 'NUMBER', 'SUM', 'COMBINED_USAGE')`, organizationID)
	require.NoError(t, err)
	err = database.DownTo(ctx, connString, combinedUsagePrevious)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "COMBINED_USAGE rows", "Down must not silently turn a combined entitlement into a calculated one")

	_, err = pool.Exec(ctx, `DELETE FROM entitlement WHERE organization_id = $1 AND slug = 'combined'`, organizationID)
	require.NoError(t, err)
	require.NoError(t, database.DownTo(ctx, connString, combinedUsagePrevious))
	var objects int
	require.NoError(t, pool.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM pg_type WHERE typname = 'entitlement_usage_source')
		+ (SELECT count(*) FROM pg_class WHERE relname = 'entitlement_source')
		+ (SELECT count(*) FROM pg_constraint WHERE conname = 'entitlement_combined_usage_check')`).Scan(&objects))
	assert.Zero(t, objects, "Down leaves neither the type, the table nor the check behind")
	require.NoError(t, database.RunMigrations(connString), "and Up applies again over the entitlements Down left")
}

// The invariants the migration adds, asserted with raw SQL, the way a hand-run
// statement would meet them: what the use cases check first is defence on top.
func TestCombinedUsageConstraints(t *testing.T) {
	newOrganization := func(ctx context.Context, t *testing.T, tx pgx.Tx) uuid.UUID {
		t.Helper()
		return insertOrganization(ctx, t, tx, uuid.New())
	}
	newEntitlement := func(ctx context.Context, t *testing.T, tx pgx.Tx, organizationID uuid.UUID, slug, kind, aggregation, usageSource string) uuid.UUID {
		t.Helper()
		var aggregationMethod any
		if aggregation != "" {
			aggregationMethod = aggregation
		}
		var id uuid.UUID
		require.NoError(t, tx.QueryRow(ctx, `INSERT INTO entitlement (organization_id, name, slug, type, aggregation_method, usage_source)
			VALUES ($1, $2, $2, $3::entitlement_type, $4::aggregation_method, $5::entitlement_usage_source) RETURNING id`,
			organizationID, slug, kind, aggregationMethod, usageSource).Scan(&id))
		return id
	}

	t.Run("an entitlement is calculated unless it says otherwise", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := newOrganization(ctx, t, tx)
			mustExec(ctx, t, tx, `INSERT INTO entitlement (organization_id, name, slug, type, aggregation_method)
				VALUES ($1, 'seats', 'seats', 'NUMBER', 'SUM')`, organizationID)
			var source string
			require.NoError(t, tx.QueryRow(ctx, `SELECT usage_source::text FROM entitlement WHERE slug = 'seats'`).Scan(&source))
			assert.Equal(t, "CALCULATED_USAGE", source)
		})
	})

	t.Run("a combined entitlement is a NUMBER summed", func(t *testing.T) {
		for _, tt := range []struct{ name, kind, aggregation string }{
			{"a BOOLEAN is not", "BOOLEAN", ""},
			{"a credit pool is not", "NUMBER_AI_CREDIT", "SUM"},
			{"an average is not", "NUMBER", "AVERAGE"},
			{"a count is not", "NUMBER", "COUNT"},
		} {
			t.Run(tt.name, func(t *testing.T) {
				withRollback(t, func(ctx context.Context, tx pgx.Tx) {
					organizationID := newOrganization(ctx, t, tx)
					var aggregationMethod any
					if tt.aggregation != "" {
						aggregationMethod = tt.aggregation
					}
					_, err := tx.Exec(ctx, `INSERT INTO entitlement (organization_id, name, slug, type, aggregation_method, usage_source)
						VALUES ($1, 'combined', 'combined', $2::entitlement_type, $3::aggregation_method, 'COMBINED_USAGE')`,
						organizationID, tt.kind, aggregationMethod)
					assertViolates(t, err, "entitlement_combined_usage_check")
				})
			})
		}

		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := newOrganization(ctx, t, tx)
			newEntitlement(ctx, t, tx, organizationID, "combined", "NUMBER", "SUM", "COMBINED_USAGE")
		})
	})

	t.Run("a weight is strictly positive, and 1 by default", func(t *testing.T) {
		for _, weight := range []string{"0", "-0.5"} {
			t.Run(weight, func(t *testing.T) {
				withRollback(t, func(ctx context.Context, tx pgx.Tx) {
					organizationID := newOrganization(ctx, t, tx)
					combined := newEntitlement(ctx, t, tx, organizationID, "combined", "NUMBER", "SUM", "COMBINED_USAGE")
					source := newEntitlement(ctx, t, tx, organizationID, "source", "NUMBER", "SUM", "CALCULATED_USAGE")
					_, err := tx.Exec(ctx, `INSERT INTO entitlement_source (organization_id, combined_entitlement_id, source_entitlement_id, weight)
						VALUES ($1, $2, $3, $4::numeric)`, organizationID, combined, source, weight)
					assertViolates(t, err, "entitlement_source_weight_check")
				})
			})
		}

		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := newOrganization(ctx, t, tx)
			combined := newEntitlement(ctx, t, tx, organizationID, "combined", "NUMBER", "SUM", "COMBINED_USAGE")
			source := newEntitlement(ctx, t, tx, organizationID, "source", "NUMBER", "SUM", "CALCULATED_USAGE")
			mustExec(ctx, t, tx, `INSERT INTO entitlement_source (organization_id, combined_entitlement_id, source_entitlement_id)
				VALUES ($1, $2, $3)`, organizationID, combined, source)
			var weight string
			require.NoError(t, tx.QueryRow(ctx, `SELECT trim_scale(weight)::text FROM entitlement_source`).Scan(&weight))
			assert.Equal(t, "1", weight)
		})
	})

	t.Run("a weight keeps its decimals", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := newOrganization(ctx, t, tx)
			combined := newEntitlement(ctx, t, tx, organizationID, "combined", "NUMBER", "SUM", "COMBINED_USAGE")
			source := newEntitlement(ctx, t, tx, organizationID, "source", "NUMBER", "SUM", "CALCULATED_USAGE")
			mustExec(ctx, t, tx, `INSERT INTO entitlement_source (organization_id, combined_entitlement_id, source_entitlement_id, weight)
				VALUES ($1, $2, $3, 12345678.1234567891)`, organizationID, combined, source)
			var weight string
			require.NoError(t, tx.QueryRow(ctx, `SELECT weight::text FROM entitlement_source`).Scan(&weight))
			assert.Equal(t, "12345678.1234567891", weight)
		})
	})

	t.Run("an entitlement is not its own source", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := newOrganization(ctx, t, tx)
			combined := newEntitlement(ctx, t, tx, organizationID, "combined", "NUMBER", "SUM", "COMBINED_USAGE")
			_, err := tx.Exec(ctx, `INSERT INTO entitlement_source (organization_id, combined_entitlement_id, source_entitlement_id)
				VALUES ($1, $2, $2)`, organizationID, combined)
			assertViolates(t, err, "entitlement_source_distinct_check")
		})
	})

	t.Run("a source is named once", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := newOrganization(ctx, t, tx)
			combined := newEntitlement(ctx, t, tx, organizationID, "combined", "NUMBER", "SUM", "COMBINED_USAGE")
			source := newEntitlement(ctx, t, tx, organizationID, "source", "NUMBER", "SUM", "CALCULATED_USAGE")
			mustExec(ctx, t, tx, `INSERT INTO entitlement_source (organization_id, combined_entitlement_id, source_entitlement_id)
				VALUES ($1, $2, $3)`, organizationID, combined, source)
			_, err := tx.Exec(ctx, `INSERT INTO entitlement_source (organization_id, combined_entitlement_id, source_entitlement_id)
				VALUES ($1, $2, $3)`, organizationID, combined, source)
			assertViolates(t, err, "entitlement_source_pkey")
		})
	})

	t.Run("a source is in the combined entitlement's organization", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID, neighbour := newOrganization(ctx, t, tx), newOrganization(ctx, t, tx)
			combined := newEntitlement(ctx, t, tx, organizationID, "combined", "NUMBER", "SUM", "COMBINED_USAGE")
			foreign := newEntitlement(ctx, t, tx, neighbour, "source", "NUMBER", "SUM", "CALCULATED_USAGE")
			_, err := tx.Exec(ctx, `INSERT INTO entitlement_source (organization_id, combined_entitlement_id, source_entitlement_id)
				VALUES ($1, $2, $3)`, organizationID, combined, foreign)
			assertViolates(t, err, "entitlement_source_source_fkey")
		})
	})

	t.Run("a link goes with either of its entitlements", func(t *testing.T) {
		for _, deleted := range []string{"combined", "source"} {
			t.Run(deleted, func(t *testing.T) {
				withRollback(t, func(ctx context.Context, tx pgx.Tx) {
					organizationID := newOrganization(ctx, t, tx)
					combined := newEntitlement(ctx, t, tx, organizationID, "combined", "NUMBER", "SUM", "COMBINED_USAGE")
					source := newEntitlement(ctx, t, tx, organizationID, "source", "NUMBER", "SUM", "CALCULATED_USAGE")
					mustExec(ctx, t, tx, `INSERT INTO entitlement_source (organization_id, combined_entitlement_id, source_entitlement_id)
						VALUES ($1, $2, $3)`, organizationID, combined, source)

					mustExec(ctx, t, tx, `DELETE FROM entitlement WHERE slug = $1`, deleted)

					var links int
					require.NoError(t, tx.QueryRow(ctx, `SELECT count(*) FROM entitlement_source`).Scan(&links))
					assert.Zero(t, links, "the link cascades: deleting a source that is still used is the use case's refusal, not the key's")
				})
			})
		}
	})

	// Deleting an organization cascades row by row. A key on the source side that
	// restricted would fail it, since a source is stored before the combined
	// entitlement that names it and so deleted first.
	t.Run("an organization is deleted with its combined entitlements", func(t *testing.T) {
		withRollback(t, func(ctx context.Context, tx pgx.Tx) {
			organizationID := newOrganization(ctx, t, tx)
			source := newEntitlement(ctx, t, tx, organizationID, "source", "NUMBER", "SUM", "CALCULATED_USAGE")
			other := newEntitlement(ctx, t, tx, organizationID, "other", "NUMBER", "SUM", "CALCULATED_USAGE")
			combined := newEntitlement(ctx, t, tx, organizationID, "combined", "NUMBER", "SUM", "COMBINED_USAGE")
			for _, s := range []uuid.UUID{source, other} {
				mustExec(ctx, t, tx, `INSERT INTO entitlement_source (organization_id, combined_entitlement_id, source_entitlement_id)
					VALUES ($1, $2, $3)`, organizationID, combined, s)
			}

			mustExec(ctx, t, tx, `DELETE FROM organization WHERE id = $1`, organizationID)

			var left int
			require.NoError(t, tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM entitlement WHERE organization_id = $1)
				+ (SELECT count(*) FROM entitlement_source WHERE organization_id = $1)`, organizationID).Scan(&left))
			assert.Zero(t, left)
		})
	})
}
