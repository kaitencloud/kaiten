package instances_test

import (
	"errors"
	"sort"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	customersdb "github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	entitlementsdb "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

// The readers of an instance's entitlement value moved from joining
// license_entitlement to reading instance_effective_entitlement. The view's
// first version is the licence grant itself, so every reader must return
// exactly what it returned before the move. These tests run each reader's
// query as it was before the move -- kept verbatim below -- next to the query
// it is now, on one catalogue covering every value shape, and require the same
// rows, byte for byte: the JSON values as stored text, the percents as the
// same SMALLINT. The readers' Go code did not change, so the same rows mean
// the same responses.

// legacyEntitlementsUsageForInstance is GetEntitlementsUsageForInstanceWithFallback
// before the move. $1 organization_id, $2 instance_id.
const legacyEntitlementsUsageForInstance = `
SELECT
  le.entitlement_id,
  e.slug            AS entitlement_slug,
  e.type            AS entitlement_type,
  e.reset_period,
  e.reset_anchor,
  i.license_id,
  i.start_license_date,
  l.slug            AS license_slug,
  le.value          AS license_value,
  eu.value          AS usage_value,
  eu.period_start,
  date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now
FROM instance i
JOIN license_entitlement le
  ON le.license_id = i.license_id
 AND le.organization_id = $1
JOIN entitlement e
  ON e.id = le.entitlement_id
LEFT JOIN "license" l
  ON l.id = i.license_id
LEFT JOIN entitlement_usage eu
  ON eu.instance_id = i.id
 AND eu.entitlement_id = le.entitlement_id
 AND eu.organization_id = $1
WHERE i.id = $2
  AND i.organization_id = $1`

// legacyEntitlementUsageForInstanceOrDefault is
// GetEntitlementUsageForInstanceOrDefault before the move, with one column
// read differently: the grant's entitlement_id where it read the grant's own
// id. Both are NULL exactly when the instance is not granted the entitlement,
// which is all its reader asks of that column; the new query names the
// entitlement, a column every later layer can fill. $1 instance_slug,
// $2 organization_id, $3 entitlement_slug.
const legacyEntitlementUsageForInstanceOrDefault = `
SELECT
  i.id              AS instance_id,
  i.license_id      AS license_id,
  i.start_license_date,
  e.id              AS entitlement_id,
  le.entitlement_id AS license_entitlement_id,
  e.type            AS entitlement_type,
  e.reset_period,
  e.reset_anchor,
  le.value          AS license_value,
  eu.value          AS usage_value,
  eu.period_start,
  e.slug            AS entitlement_slug,
  l.slug            AS license_slug,
  date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now
FROM (VALUES (true)) AS sentinel(ok)
LEFT JOIN instance i
  ON i.slug            = $1
 AND i.organization_id = $2
LEFT JOIN entitlement e
  ON e.slug            = $3
 AND e.organization_id = $2
LEFT JOIN license_entitlement le
  ON le.license_id     = i.license_id
 AND le.entitlement_id = e.id
 AND le.organization_id = $2
LEFT JOIN entitlement_usage eu
  ON eu.instance_id    = i.id
 AND eu.entitlement_id = e.id
 AND eu.organization_id = $2
LEFT JOIN "license" l
  ON l.id = i.license_id`

// legacyEntitlementContextBySlug is GetEntitlementContextBySlug before the
// move, without the two columns the report now reads under the pair's lock
// instead (legacyGateLimit). $1 entitlement_slug, $2 organization_id,
// $3 instance_slug.
const legacyEntitlementContextBySlug = `
SELECT
  i.id                AS instance_id,
  i.license_id,
  i.start_license_date,
  e.id                AS entitlement_id,
  e.slug              AS entitlement_slug,
  e.type              AS entitlement_type,
  e.aggregation_method,
  e.warning_threshold_percent,
  e.reset_period,
  e.reset_anchor,
  l.slug              AS license_slug
FROM instance i
JOIN entitlement e
  ON e.slug            = $1
 AND e.organization_id = $2
JOIN license_entitlement le
  ON le.license_id     = i.license_id
 AND le.entitlement_id = e.id
 AND le.organization_id = $2
LEFT JOIN "license" l
  ON l.id = i.license_id
WHERE i.slug            = $3
  AND i.organization_id = $2`

// legacyGateLimit is the limit and percent the report gated on before the
// move, which GetEntitlementContextBySlug read with the slugs. $1 instance_id,
// $2 entitlement_id, $3 organization_id.
const legacyGateLimit = `
SELECT le.value, le.limit_cap_exceeded_overage_percent
FROM instance i
JOIN license_entitlement le
  ON le.license_id     = i.license_id
 AND le.entitlement_id = $2
 AND le.organization_id = $3
WHERE i.id = $1
  AND i.organization_id = $3`

// legacyEntitlementGroupUsage is GetEntitlementGroupUsage before the move.
// $1 instance_slug, $2 group_slug, $3 organization_id.
const legacyEntitlementGroupUsage = `
SELECT e.id              AS entitlement_id,
       e.slug            AS entitlement_slug,
       e.name            AS entitlement_name,
       e.type            AS entitlement_type,
       e.reset_period,
       e.reset_anchor,
       i.start_license_date,
       eu.value          AS usage_value,
       eu.period_start,
       le.value          AS license_value,
       date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now
FROM entitlement_group eg
JOIN entitlement_group_membership egm ON egm.entitlement_group_id = eg.id
JOIN entitlement e ON e.id = egm.entitlement_id
JOIN instance i ON i.slug = $1 AND i.organization_id = eg.organization_id
LEFT JOIN entitlement_usage eu ON eu.entitlement_id = e.id AND eu.instance_id = i.id AND eu.organization_id = eg.organization_id
LEFT JOIN license_entitlement le ON le.entitlement_id = e.id AND le.license_id = i.license_id AND le.organization_id = eg.organization_id
WHERE eg.slug = $2
  AND eg.organization_id = $3`

// legacyTargetingFacts is GetTargetingFactsByCustomerSlug before the move.
// $1 organization_id, $2 customer_slug.
const legacyTargetingFacts = `
WITH primary_instance AS (
  SELECT i.id, i.license_id
  FROM instance i
         JOIN customer c ON c.id = i.customer_id AND c.organization_id = i.organization_id
  WHERE c.organization_id = $1
    AND c.slug = $2
  ORDER BY i.created_at, i.id
  LIMIT 1
)
SELECT l.slug           AS license_slug,
       lf.slug          AS license_family_slug,
       l.type           AS license_type,
       e.slug           AS entitlement_slug,
       le.value         AS limit_value,
       eu.value         AS usage_value
FROM primary_instance pi
       JOIN "license" l ON l.id = pi.license_id
       JOIN license_family lf ON lf.id = l.family_id AND lf.organization_id = l.organization_id
       LEFT JOIN license_entitlement le
         ON le.license_id = l.id AND le.organization_id = $1
       LEFT JOIN entitlement e
         ON e.id = le.entitlement_id AND e.organization_id = $1
       LEFT JOIN entitlement_usage eu
         ON eu.instance_id = pi.id
        AND eu.entitlement_id = e.id
        AND eu.organization_id = $1
ORDER BY e.slug`

// legacyRows runs a legacy query and scans each row, by position, into the
// new query's row type. No rows is nil, as sqlc returns it.
func legacyRows[T any](t *testing.T, sql string, args ...any) []T {
	t.Helper()
	rows, err := testServer.Dependencies.DB.Query(t.Context(), sql, args...)
	require.NoError(t, err)
	out, err := pgx.CollectRows(rows, pgx.RowToStructByPos[T])
	require.NoError(t, err)
	if len(out) == 0 {
		return nil
	}
	return out
}

// effectiveCatalogue is one licence granting every value shape to two
// instances, a licence granting nothing to a third, an entitlement no licence
// grants, usage on some pairs, and a group mixing granted and ungranted
// entitlements.
type effectiveCatalogue struct {
	instances     []uuid.UUID
	instanceSlugs []string
	entitlements  []string // slugs, the ungranted one and an unknown one included
	groupSlug     string
	customers     []string // slugs
}

func newEffectiveCatalogue(t *testing.T) effectiveCatalogue {
	t.Helper()
	granted := newInstances(t, 2) // one licence, one customer
	bare := newInstances(t, 1)[0] // its own licence, granting nothing
	license := granted[0].LicenseSlug
	pool := testServer.Dependencies.DB

	monthly := newPeriodicEntitlement(t, period.Month, period.Calendar)
	assignEntitlementToLicenseWithOverage(t, license, monthly.Slug, 1000, 20)
	decimal := newEntitlement(t)
	assignEntitlementToLicense(t, license, decimal.Slug, 1000)
	_, err := pool.Exec(t.Context(), `UPDATE license_entitlement SET value = '{"type":"number","value":1000.5}'
		WHERE entitlement_id = $1`, decimal.ID)
	require.NoError(t, err)
	unlimited := newEntitlement(t)
	assignEntitlementToLicense(t, license, unlimited.Slug, -1)
	credits := newEntitlementWithType(t, entitlementschema.NumberAICredit)
	assignEntitlementToLicenseWithOverage(t, license, credits.Slug, 250, 0)
	on := newEntitlementWithType(t, entitlementschema.Boolean)
	assignBooleanEntitlementToLicense(t, license, on.Slug, true)
	off := newEntitlementWithType(t, entitlementschema.Boolean)
	assignBooleanEntitlementToLicense(t, license, off.Slug, false)
	config := newEntitlementWithType(t, entitlementschema.Config)
	assignConfigEntitlementToLicense(t, license, config.Slug)
	ungranted := newEntitlement(t)

	requireStatus(t, fiber.StatusOK, granted[0].Slug, monthly.Slug, 300, "append")
	requireStatus(t, fiber.StatusOK, granted[0].Slug, decimal.Slug, 2.5, "append")
	requireStatus(t, fiber.StatusOK, granted[1].Slug, credits.Slug, 7, "append")

	org := testDb.DefaultData.OrganizationID
	var groupID uuid.UUID
	require.NoError(t, pool.QueryRow(t.Context(), `INSERT INTO entitlement_group (name, slug, organization_id)
		VALUES ('Golden', 'golden', $1) RETURNING id`, org).Scan(&groupID))
	for _, id := range []uuid.UUID{monthly.ID, on.ID, config.ID, ungranted.ID} {
		_, err := pool.Exec(t.Context(), `INSERT INTO entitlement_group_membership (entitlement_group_id, entitlement_id, organization_id)
			VALUES ($1, $2, $3)`, groupID, id, org)
		require.NoError(t, err)
	}

	customerSlug := func(instanceID uuid.UUID) string {
		var slug string
		require.NoError(t, pool.QueryRow(t.Context(), `SELECT c.slug FROM customer c JOIN instance i ON i.customer_id = c.id
			WHERE i.id = $1`, instanceID).Scan(&slug))
		return slug
	}

	return effectiveCatalogue{
		instances:     []uuid.UUID{granted[0].ID, granted[1].ID, bare.ID},
		instanceSlugs: []string{granted[0].Slug, granted[1].Slug, bare.Slug, "nope"},
		entitlements: []string{
			monthly.Slug, decimal.Slug, unlimited.Slug, credits.Slug, on.Slug, off.Slug,
			config.Slug, ungranted.Slug, "nope",
		},
		groupSlug: "golden",
		customers: []string{customerSlug(granted[0].ID), customerSlug(bare.ID), "nope"},
	}
}

func TestEffectiveEntitlementReadersAreUnchanged(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	catalogue := newEffectiveCatalogue(t)
	ctx := t.Context()
	org := testDb.DefaultData.OrganizationID
	instancesDB := db.New(testServer.Dependencies.DB)

	t.Run("EveryEntitlementOfAnInstance", func(t *testing.T) {
		for _, instanceID := range catalogue.instances {
			want := legacyRows[db.GetEntitlementsUsageForInstanceWithFallbackRow](t, legacyEntitlementsUsageForInstance, org, instanceID)
			got, err := instancesDB.GetEntitlementsUsageForInstanceWithFallback(ctx, db.GetEntitlementsUsageForInstanceWithFallbackParams{
				OrganizationID: org, InstanceID: instanceID,
			})
			require.NoError(t, err)
			normalize := func(rows []db.GetEntitlementsUsageForInstanceWithFallbackRow) {
				for i := range rows {
					rows[i].Now = pgtype.Timestamp{}
				}
				sort.Slice(rows, func(i, j int) bool { return rows[i].EntitlementID.String() < rows[j].EntitlementID.String() })
			}
			normalize(want)
			normalize(got)
			require.Equal(t, want, got, "instance %s", instanceID)
		}
	})

	t.Run("OneEntitlementOfAnInstance", func(t *testing.T) {
		for _, instanceSlug := range catalogue.instanceSlugs {
			for _, entitlementSlug := range catalogue.entitlements {
				want := legacyRows[db.GetEntitlementUsageForInstanceOrDefaultRow](t, legacyEntitlementUsageForInstanceOrDefault,
					instanceSlug, org, entitlementSlug)
				got, err := instancesDB.GetEntitlementUsageForInstanceOrDefault(ctx, db.GetEntitlementUsageForInstanceOrDefaultParams{
					OrganizationID: org, InstanceSlug: instanceSlug, EntitlementSlug: entitlementSlug,
				})
				require.NoError(t, err)
				require.Len(t, want, 1)
				want[0].Now, got.Now = pgtype.Timestamp{}, pgtype.Timestamp{}
				require.Equal(t, want[0], got, "%s / %s", instanceSlug, entitlementSlug)
			}
		}
	})

	t.Run("TheReportGate", func(t *testing.T) {
		for _, instanceSlug := range catalogue.instanceSlugs {
			for _, entitlementSlug := range catalogue.entitlements {
				want := legacyRows[db.GetEntitlementContextBySlugRow](t, legacyEntitlementContextBySlug, entitlementSlug, org, instanceSlug)
				got, err := instancesDB.GetEntitlementContextBySlug(ctx, db.GetEntitlementContextBySlugParams{
					OrganizationID: org, InstanceSlug: instanceSlug, EntitlementSlug: entitlementSlug,
				})
				if len(want) == 0 {
					require.True(t, errors.Is(err, pgx.ErrNoRows), "%s / %s: not granted before, so not now: %v", instanceSlug, entitlementSlug, err)
					continue
				}
				require.NoError(t, err)
				require.Equal(t, want[0], got, "%s / %s", instanceSlug, entitlementSlug)

				wantLimit := legacyRows[db.GetEffectiveEntitlementLimitRow](t, legacyGateLimit, got.InstanceID, got.EntitlementID, org)
				gotLimit, err := instancesDB.GetEffectiveEntitlementLimit(ctx, db.GetEffectiveEntitlementLimitParams{
					OrganizationID: org, InstanceID: got.InstanceID, EntitlementID: got.EntitlementID,
				})
				require.NoError(t, err)
				require.Len(t, wantLimit, 1)
				require.Equal(t, wantLimit[0], gotLimit, "%s / %s", instanceSlug, entitlementSlug)
			}
		}
	})

	t.Run("EntitlementGroupUsage", func(t *testing.T) {
		groups := entitlementsdb.New(testServer.Dependencies.DB)
		for _, instanceSlug := range catalogue.instanceSlugs {
			want := legacyRows[entitlementsdb.GetEntitlementGroupUsageRow](t, legacyEntitlementGroupUsage, instanceSlug, catalogue.groupSlug, org)
			got, err := groups.GetEntitlementGroupUsage(ctx, entitlementsdb.GetEntitlementGroupUsageParams{
				OrganizationID: org, InstanceSlug: instanceSlug, GroupSlug: catalogue.groupSlug,
			})
			require.NoError(t, err)
			normalize := func(rows []entitlementsdb.GetEntitlementGroupUsageRow) {
				for i := range rows {
					rows[i].Now = pgtype.Timestamp{}
				}
				sort.Slice(rows, func(i, j int) bool { return rows[i].EntitlementID.String() < rows[j].EntitlementID.String() })
			}
			normalize(want)
			normalize(got)
			require.Equal(t, want, got, "instance %s", instanceSlug)
		}
	})

	t.Run("FeatureFlagTargetingFacts", func(t *testing.T) {
		customers := customersdb.New(testServer.Dependencies.DB)
		for _, customerSlug := range catalogue.customers {
			want := legacyRows[customersdb.GetTargetingFactsByCustomerSlugRow](t, legacyTargetingFacts, org, customerSlug)
			got, err := customers.GetTargetingFactsByCustomerSlug(ctx, customersdb.GetTargetingFactsByCustomerSlugParams{
				OrganizationID: org, CustomerSlug: customerSlug,
			})
			require.NoError(t, err)
			if len(want) == 0 {
				require.Empty(t, got, "customer %s", customerSlug)
				continue
			}
			require.Equal(t, want, got, "customer %s", customerSlug)
		}
	})

	t.Run("TheViewIsTheLicenceGrant", func(t *testing.T) {
		// Both directions of the set difference between the view and the join
		// it replaces, the JSON compared as its stored text.
		const grants = `
			SELECT i.organization_id, i.id, i.license_id, e.id, e.slug, e.type::text,
			       le.value::text, le.limit_cap_exceeded_overage_percent, le.id
			FROM instance i
			JOIN license_entitlement le ON le.license_id = i.license_id AND le.organization_id = i.organization_id
			JOIN entitlement e ON e.id = le.entitlement_id AND e.organization_id = i.organization_id`
		const view = `
			SELECT organization_id, instance_id, license_id, entitlement_id, entitlement_slug, entitlement_type::text,
			       value::text, limit_cap_exceeded_overage_percent, license_entitlement_id
			FROM instance_effective_entitlement`
		for _, q := range []string{"(" + grants + ") EXCEPT ALL (" + view + ")", "(" + view + ") EXCEPT ALL (" + grants + ")"} {
			var differing int
			require.NoError(t, testServer.Dependencies.DB.QueryRow(ctx, "SELECT count(*) FROM ("+q+") d").Scan(&differing))
			require.Zero(t, differing)
		}
		var rows, extra int
		require.NoError(t, testServer.Dependencies.DB.QueryRow(ctx, `
			SELECT count(*), count(*) FILTER (WHERE addon_grant_count <> 0 OR boost_grant_count <> 0
			                                      OR license_value::text <> value::text
			                                      OR license_overage_percent IS DISTINCT FROM limit_cap_exceeded_overage_percent)
			FROM instance_effective_entitlement WHERE organization_id = $1`, org).Scan(&rows, &extra))
		require.Equal(t, 7*2, rows, "seven grants on each of two instances")
		require.Zero(t, extra)
	})
}

func TestStampReportInstantSetsTheEvaluationInstant(t *testing.T) {
	ctx := t.Context()
	tx, err := testServer.Dependencies.DB.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()

	stamp, err := db.New(tx).StampReportInstant(ctx)
	require.NoError(t, err)
	require.Zero(t, stamp.Now.Time.Nanosecond()%int(time.Millisecond), "the instant is truncated to the millisecond")

	var setting string
	require.NoError(t, tx.QueryRow(ctx, `SELECT current_setting('kaiten.entitlement_effective_at')`).Scan(&setting))
	require.Equal(t, stamp.Now.Time.UTC().Format("2006-01-02 15:04:05.000"), setting)
	require.Equal(t, setting, stamp.EffectiveAt)
	require.NoError(t, tx.Rollback(ctx))

	// Transaction-local: the next transaction on the pool does not inherit it.
	require.NoError(t, testServer.Dependencies.DB.QueryRow(ctx,
		`SELECT coalesce(current_setting('kaiten.entitlement_effective_at', true), '')`).Scan(&setting))
	require.Empty(t, setting)
}
