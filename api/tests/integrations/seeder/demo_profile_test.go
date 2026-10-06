package seeder_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	customertargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/customers/targetingfacts"
	deploymentzoneevents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	instanceevents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	licenseevents "github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/feed"
	notificationsdb "github.com/kaitencloud/kaiten/api/internal/modules/notifications/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	demoprofile "github.com/kaitencloud/kaiten/api/internal/seeder/profiles/demo"
	"github.com/kaitencloud/kaiten/api/tests"
)

// TestDemoProfileSeedsTheSushiShopBaseline runs the real `demo` profile
// against a real Postgres and checks the invariants the source dataset
// (kaiten-sushi-shop.seed.json) exists to guarantee: the full entity count,
// the "license attaches to the instance, not the customer" story, the
// periodic usage window, and a full audit trail replay.
func TestDemoProfileSeedsTheSushiShopBaseline(t *testing.T) {
	ctx := context.Background()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	sc := seeder.NewSeederContext(testDB.DbPool, nil)
	require.NoError(t, demoprofile.NewProfile().Seed(ctx, sc))

	var orgID string
	require.NoError(t, testDB.DbPool.QueryRow(ctx, `
		SELECT id FROM organization WHERE external_id = 'seed-kaiten-sushi-shop'
	`).Scan(&orgID))

	require.Equal(t, 6, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM entitlement WHERE organization_id = $1`, orgID))
	require.Equal(t, 2, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM entitlement_group WHERE organization_id = $1`, orgID))
	// Six license rows across three families: one product with a single
	// version, one revised once, one with a full history. The families are what
	// the catalogue addresses; the rows are their versions.
	require.Equal(t, 6, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM "license" WHERE organization_id = $1`, orgID))
	require.Equal(t, 3, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM "license_family" WHERE organization_id = $1`, orgID))
	require.Equal(t, 4, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM customer WHERE organization_id = $1`, orgID))
	require.Equal(t, 6, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM instance WHERE organization_id = $1`, orgID))
	require.Equal(t, 3, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM deployment_zone WHERE organization_id = $1`, orgID))
	require.Equal(t, 2, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM release WHERE organization_id = $1`, orgID))
	require.Equal(t, 7, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM component WHERE organization_id = $1`, orgID))
	require.Equal(t, 7, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM feature_flags WHERE organization_id = $1`, orgID))
	require.Equal(t, 5, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM deployment d JOIN deployment_zone z ON z.id = d.deployment_zone_id WHERE z.organization_id = $1`, orgID))
	require.Equal(t, 15, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM audit_trail WHERE organization_id = $1`, orgID))

	// Members are the shared TMNT identities, not a bespoke set -- this is
	// what makes the org reachable through the local dev token switcher.
	for _, externalID := range []string{"user_splinter", "user_leo", "user_donnie", "user_raph", "user_april"} {
		require.Equal(t, 1, countRows(t, ctx, testDB, `
			SELECT COUNT(*)
			FROM "user" u
			JOIN user_on_organization uoo ON uoo.user_id = u.id
			WHERE uoo.organization_id = $1 AND u.external_id = $2
		`, orgID, externalID), externalID)
	}

	// The dataset's central point: license attaches to the instance, not
	// the customer. Sakura Tokyo's two instances must resolve two
	// different licenses.
	require.Equal(t, 2, countRows(t, ctx, testDB, `
		SELECT COUNT(DISTINCT i.license_id)
		FROM instance i
		JOIN customer c ON c.id = i.customer_id
		WHERE c.organization_id = $1 AND c.slug = 'sakura-tokyo'
	`, orgID))

	// monthly-orders resets MONTH/CALENDAR, so its usage row needs a
	// non-null period_start; the other (lifetime) entitlements need a null
	// one.
	require.Equal(t, 6, countRows(t, ctx, testDB, `
		SELECT COUNT(*)
		FROM entitlement_usage eu
		JOIN entitlement e ON e.id = eu.entitlement_id
		WHERE eu.organization_id = $1 AND e.slug = 'monthly-orders' AND eu.period_start IS NOT NULL
	`, orgID))
	require.Zero(t, countRows(t, ctx, testDB, `
		SELECT COUNT(*)
		FROM entitlement_usage eu
		JOIN entitlement e ON e.id = eu.entitlement_id
		WHERE eu.organization_id = $1 AND e.slug != 'monthly-orders' AND eu.period_start IS NOT NULL
	`, orgID))

	// Every seeded counter comes with the usage_ledger row that explains it:
	// report_seq 1, in the counter's own window, ending at the counter's value.
	require.Zero(t, countRows(t, ctx, testDB, `
		SELECT COUNT(*)
		FROM entitlement_usage eu
		LEFT JOIN usage_ledger ul
		  ON ul.instance_id = eu.instance_id AND ul.entitlement_id = eu.entitlement_id
		 AND ul.report_seq = eu.report_seq
		 AND ul.window_start IS NOT DISTINCT FROM eu.period_start
		 AND ul.value_after = (eu.value->>'value')::numeric
		WHERE eu.organization_id = $1 AND (eu.report_seq <> 1 OR ul.report_seq IS NULL)
	`, orgID), "a seeded counter has no matching journal row")

	// Sakura Dedicated stays on the July release -- the "pending upgrade"
	// zone the deployment journal exists to show.
	require.Equal(t, 1, countRows(t, ctx, testDB, `
		SELECT COUNT(*)
		FROM deployment d
		JOIN deployment_zone z ON z.id = d.deployment_zone_id
		WHERE z.organization_id = $1 AND z.slug = 'sakura-dedicated'
	`, orgID))

	// Premium is the family the resolution rule exists for: v1 withdrawn, v2 on
	// sale and the family's default, v3 being prepared. A console opening this
	// organization sees all three states without anyone having to stage them.
	require.Equal(t, 1, countRows(t, ctx, testDB, `
		SELECT COUNT(*) FROM "license"
		WHERE organization_id = $1 AND name = 'Premium' AND lifecycle_state = 'ARCHIVED'
	`, orgID))
	require.Equal(t, 1, countRows(t, ctx, testDB, `
		SELECT COUNT(*) FROM "license"
		WHERE organization_id = $1 AND name = 'Premium' AND lifecycle_state = 'DRAFT'
	`, orgID))

	// And the family resolves to v2 -- not v3, which is newer, and not v1.
	//
	// Asked through the query the API itself resolves with, rather than through a
	// copy of its ORDER BY. Spelling the rule out here again would make this test
	// pass on the strength of its own duplicate: change the real ordering and
	// this would go on asserting the old behaviour, green, while every caller got
	// something else.
	orgUUID, err := uuid.Parse(orgID)
	require.NoError(t, err)

	premium := resolveFamily(t, ctx, testDB, orgUUID, "premium")
	require.Equal(t, int32(2), premium.Version)
	require.True(t, premium.IsDefault, "v2 is the version the vendor put forward; v3 is a draft, which nothing serves")

	// Standard is the family where the default decides: v2 is published and
	// newer, and the family still resolves to v1, its default. Its one instance
	// is pinned there accordingly.
	standard := resolveFamily(t, ctx, testDB, orgUUID, "standard")
	require.Equal(t, int32(1), standard.Version)
	require.True(t, standard.IsDefault)
	require.Equal(t, 1, countRows(t, ctx, testDB, `
		SELECT COUNT(*) FROM "license"
		WHERE organization_id = $1 AND slug = 'standard-v2' AND lifecycle_state = 'PUBLISHED' AND NOT is_default
	`, orgID), "v2 is on sale, so only the default keeps v1 served")
	require.Equal(t, 1, countRows(t, ctx, testDB, `
		SELECT COUNT(*)
		FROM instance i
		       JOIN "license" l ON l.id = i.license_id
		WHERE i.organization_id = $1 AND i.slug = 'demo-restaurant-prod' AND l.slug = 'standard'
	`, orgID))

	// The catalogue's addresses are the same on every seed: each family under
	// its own slug, which its first version shares, and later versions under
	// {slug}-v{n}.
	require.Equal(t, []string{"premium", "standard", "starter"}, stringColumn(t, ctx, testDB, `
		SELECT slug FROM license_family WHERE organization_id = $1 ORDER BY slug
	`, orgID))
	require.Equal(t, []string{"premium", "premium-v2", "premium-v3", "standard", "standard-v2", "starter"}, stringColumn(t, ctx, testDB, `
		SELECT slug FROM "license" WHERE organization_id = $1 ORDER BY slug
	`, orgID))

	// A revision changes what the product grants, not only its description.
	require.Equal(t, "false", grantedValue(t, ctx, testDB, orgID, "standard", "delivery-tracking"))
	require.Equal(t, "true", grantedValue(t, ctx, testDB, orgID, "standard-v2", "delivery-tracking"))
	require.Equal(t, "5", grantedValue(t, ctx, testDB, orgID, "premium", "delivery-drivers"))
	require.Equal(t, "10", grantedValue(t, ctx, testDB, orgID, "premium-v2", "delivery-drivers"))
	require.Equal(t, "50", grantedValue(t, ctx, testDB, orgID, "premium-v2", "menu-items"))
	require.Equal(t, "100", grantedValue(t, ctx, testDB, orgID, "premium-v3", "menu-items"))

	// Instances sit where a catalogue with history puts them (S3). Two are not
	// on the version their family serves: Kappa Kyoto stayed on Premium v1,
	// withdrawn after it was bought -- an instance keeps an archived version, it
	// just cannot be given one (D1) -- and Ninja Osaka's pilot runs Standard v2
	// while Standard still puts v1 forward. Every other instance is on its
	// family's current version, and none is on a draft.
	require.Equal(t, map[string]string{
		"kappa-kyoto-prod":     "premium",
		"ninja-osaka-delivery": "standard-v2",
	}, instancesOffTheirFamilysVersion(t, ctx, testDB, orgUUID))
	require.Equal(t, []string{"kappa-kyoto-prod"}, stringColumn(t, ctx, testDB, `
		SELECT i.slug
		FROM instance i
		       JOIN "license" l ON l.id = i.license_id
		WHERE i.organization_id = $1 AND l.lifecycle_state <> 'PUBLISHED'
	`, orgID))
	require.Equal(t, "ARCHIVED", stringColumn(t, ctx, testDB, `
		SELECT lifecycle_state::text FROM "license" WHERE organization_id = $1 AND slug = 'premium'
	`, orgID)[0])

	// Both Premium customers are Premium to a flag rule, whichever version they
	// are on: the facts carry the family, and the demo's rules read it (F1).
	facts := customertargetingfacts.New(testDB.DbPool)
	for customerSlug, versionSlug := range map[string]string{
		"sakura-tokyo": "premium-v2",
		"kappa-kyoto":  "premium",
	} {
		rows, err := facts.GetTargetingFactsByCustomerSlug(ctx, orgUUID, customerSlug)
		require.NoError(t, err)
		require.NotEmpty(t, rows, customerSlug)
		require.Equal(t, versionSlug, rows[0].LicenseSlug, customerSlug)
		require.Equal(t, "premium", rows[0].LicenseFamilySlug, customerSlug)
	}
	require.Zero(t, countRows(t, ctx, testDB, `
		SELECT COUNT(*) FROM feature_flags
		WHERE organization_id = $1 AND targeting_rules::text LIKE '%license.slug%'
	`, orgID), "the demo's rules target products, not versions")

	// Premium v1 got to ARCHIVED the way a vendor's version does: created on
	// sale, then withdrawn through archive-license, which recorded it.
	// create-license refuses to create a version archived, so a seed that tried
	// would not have got this far -- but the event is what shows the transition
	// actually ran, rather than the state being written some other way.
	require.Equal(t, 1, countRows(t, ctx, testDB, `
		SELECT COUNT(*)
		FROM outbox_events
		WHERE organization_id = $1
		  AND event_name = 'LICENSE_ARCHIVED'
		  AND data->>'name' = 'Premium'
		  AND data->>'version' = '1'
	`, orgID))
	require.Zero(t, countRows(t, ctx, testDB, `
		SELECT COUNT(*)
		FROM outbox_events
		WHERE organization_id = $1
		  AND event_name = 'LICENSE_CREATED'
		  AND data->>'lifecycleState' = 'ARCHIVED'
	`, orgID), "no version is created archived")
}

// TestDemoNotificationsOpenWhatTheyAreAbout reads the seeded audit trail through
// the notification feed, the way the bell does. The notifiable events carry
// their real producers' payloads, so each one reads as a sentence and opens the
// object it is about -- the regression being demo rows that read "An instance
// was created" and opened a list.
func TestDemoNotificationsOpenWhatTheyAreAbout(t *testing.T) {
	ctx := context.Background()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	sc := seeder.NewSeederContext(testDB.DbPool, nil)
	require.NoError(t, demoprofile.NewProfile().Seed(ctx, sc))

	var orgID, userID uuid.UUID
	require.NoError(t, testDB.DbPool.QueryRow(ctx, `
		SELECT o.id, u.id
		FROM organization o
		JOIN user_on_organization uoo ON uoo.organization_id = o.id
		JOIN "user" u ON u.id = uoo.user_id
		WHERE o.external_id = 'seed-kaiten-sushi-shop' AND u.external_id = 'user_splinter'
	`).Scan(&orgID, &userID))

	// since the license-family split a product has several versions, all sharing its name, so a
	// lookup by name has no single answer. An audit entry about a product opens
	// the version its family serves, which is what the seed records.
	licenseSlug := func(familySlug string) string {
		return resolveFamily(t, ctx, testDB, orgID, familySlug).Slug
	}

	list, err := feed.List(ctx, notificationsdb.New(testDB.DbPool), feed.Query{
		UserID:         userID,
		OrganizationID: orgID,
		Subscription: feed.Subscription{
			instanceevents.InstanceCreated.Name,
			instanceevents.InstanceEntitlementUsageReached.Name,
			deploymentzoneevents.ReleaseDeployed.Name,
			licenseevents.LicenseEntitlementAssigned.Name,
		},
		UnreadOnly: false,
		Limit:      feed.MaxLimit,
		Cursor:     "",
	})
	require.NoError(t, err)

	opens := map[string]string{}
	for _, notification := range list.Data {
		require.NotNil(t, notification.ActionURL, "%q links nowhere", notification.Title)
		opens[notification.Title] = *notification.ActionURL
	}

	assert.Equal(t, map[string]string{
		"Delivery Tracking was assigned to Premium":             "/licenses/" + licenseSlug("premium"),
		"Delivery Tracking was assigned to Starter":             "/licenses/" + licenseSlug("starter"),
		"Sakura Tokyo Production was created":                   "/customers/instances/sakura-tokyo-prod",
		"Ninja Osaka Production was created":                    "/customers/instances/ninja-osaka-prod",
		"Sakura Tokyo Demo was created":                         "/customers/instances/sakura-tokyo-demo",
		"Release 2026.8.0 was deployed to Shared EU":            "/releases/deployment-zones/shared-eu",
		"Ninja Osaka Production has used all of its menu-items": "/customers/instances/ninja-osaka-prod/entitlements",
	}, opens)
}

// resolveFamily returns the version the family slugged familySlug resolves to,
// through the query the family endpoints use.
func resolveFamily(t *testing.T, ctx context.Context, testDB *tests.TestDatabase, orgID uuid.UUID, familySlug string) licensesdb.License {
	t.Helper()

	var familyID uuid.UUID
	require.NoError(t, testDB.DbPool.QueryRow(ctx, `
		SELECT id FROM license_family WHERE organization_id = $1 AND slug = $2
	`, orgID, familySlug).Scan(&familyID))

	resolved, err := licensesdb.New(testDB.DbPool).GetCurrentLicenseVersionsByFamilyIDs(
		ctx, licensesdb.GetCurrentLicenseVersionsByFamilyIDsParams{
			OrganizationID: orgID,
			FamilyIds:      []uuid.UUID{familyID},
		})
	require.NoError(t, err)
	require.Lenf(t, resolved, 1, "family %q resolves to exactly one version", familySlug)
	return resolved[0]
}

// instancesOffTheirFamilysVersion maps every instance that is not on the
// version its family resolves to, to the slug of the version it is on. The
// resolution comes from the query the family endpoints use.
func instancesOffTheirFamilysVersion(t *testing.T, ctx context.Context, testDB *tests.TestDatabase, orgID uuid.UUID) map[string]string {
	t.Helper()

	type pin struct {
		instance  string
		license   string
		licenseID uuid.UUID
		familyID  uuid.UUID
	}
	rows, err := testDB.DbPool.Query(ctx, `
		SELECT i.slug, l.slug, l.id, l.family_id
		FROM instance i
		       JOIN "license" l ON l.id = i.license_id
		WHERE i.organization_id = $1
	`, orgID)
	require.NoError(t, err)
	pins, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (pin, error) {
		var p pin
		err := row.Scan(&p.instance, &p.license, &p.licenseID, &p.familyID)
		return p, err
	})
	require.NoError(t, err)

	familyIDs := make([]uuid.UUID, 0, len(pins))
	for _, p := range pins {
		familyIDs = append(familyIDs, p.familyID)
	}
	current, err := licensesdb.New(testDB.DbPool).GetCurrentLicenseVersionsByFamilyIDs(
		ctx, licensesdb.GetCurrentLicenseVersionsByFamilyIDsParams{
			OrganizationID: orgID,
			FamilyIds:      familyIDs,
		})
	require.NoError(t, err)
	served := make(map[uuid.UUID]uuid.UUID, len(current))
	for _, version := range current {
		served[version.FamilyID] = version.ID
	}

	off := make(map[string]string)
	for _, p := range pins {
		if served[p.familyID] != p.licenseID {
			off[p.instance] = p.license
		}
	}
	return off
}

// grantedValue returns the value licenseSlug grants for entitlementSlug, as
// the text of its JSON value.
func grantedValue(t *testing.T, ctx context.Context, testDB *tests.TestDatabase, orgID, licenseSlug, entitlementSlug string) string {
	t.Helper()

	var value string
	require.NoError(t, testDB.DbPool.QueryRow(ctx, `
		SELECT le.value->>'value'
		FROM license_entitlement le
		       JOIN "license" l ON l.id = le.license_id
		       JOIN entitlement e ON e.id = le.entitlement_id
		WHERE l.organization_id = $1 AND l.slug = $2 AND e.slug = $3
	`, orgID, licenseSlug, entitlementSlug).Scan(&value), "%s grants %s", licenseSlug, entitlementSlug)
	return value
}

func stringColumn(t *testing.T, ctx context.Context, testDB *tests.TestDatabase, query string, args ...any) []string {
	t.Helper()

	rows, err := testDB.DbPool.Query(ctx, query, args...)
	require.NoError(t, err)
	values, err := pgx.CollectRows(rows, pgx.RowTo[string])
	require.NoError(t, err)
	return values
}
