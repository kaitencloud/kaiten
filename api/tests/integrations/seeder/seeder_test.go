package seeder_test

import (
	"context"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	usersdb "github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	demoprofile "github.com/kaitencloud/kaiten/api/internal/seeder/profiles/demo"
	stresstest "github.com/kaitencloud/kaiten/api/internal/seeder/profiles/stress-test"
	"github.com/kaitencloud/kaiten/api/tests"
)

type recordingUsageReporter struct {
	mu      sync.Mutex
	reports []usageReport
}

type usageReport struct {
	organizationID  uuid.UUID
	entitlementSlug string
}

func (r *recordingUsageReporter) TrackAsync(uuid.UUID, string) {}

func (r *recordingUsageReporter) DecrementAsync(uuid.UUID, string) {}

func (r *recordingUsageReporter) ReportAndEnforce(_ context.Context, organizationID uuid.UUID, entitlementSlug string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.reports = append(r.reports, usageReport{
		organizationID:  organizationID,
		entitlementSlug: entitlementSlug,
	})
	return nil
}

func (r *recordingUsageReporter) Decrement(context.Context, uuid.UUID, string) error {
	return nil
}

func (r *recordingUsageReporter) count(organizationID uuid.UUID, entitlementSlug string) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	count := 0
	for _, report := range r.reports {
		if report.organizationID == organizationID && report.entitlementSlug == entitlementSlug {
			count++
		}
	}
	return count
}

func TestSeederContextPropagatesUsageReporter(t *testing.T) {
	ctx := context.Background()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	organizationID := uuid.New()
	createOrganizationWithMembership(t, ctx, testDB, organizationID, "Reporting Customer", testDB.DefaultData.UserID)

	reporter := &recordingUsageReporter{}
	sc := seeder.NewSeederContext(testDB.DbPool, reporter).WithOrganization(organizationID, testDB.DefaultData.UserID)
	_, err = sc.Customers.CreateCustomer.Execute(ctx, &createcustomer.Command{Name: "Reported Customer"})
	require.NoError(t, err)

	require.Equal(t, []usageReport{{
		organizationID:  organizationID,
		entitlementSlug: dogfooding.CustomerEntitlementSlug,
	}}, reporter.reports)
}

func TestRunSeedsExistingOrganizations(t *testing.T) {
	ctx := context.Background()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	targetOrganizationID := uuid.New()
	createOrganizationWithMembership(t, ctx, testDB, targetOrganizationID, "Beta Customer", testDB.DefaultData.UserID)

	reporter := &recordingUsageReporter{}
	err = seeder.Run(ctx, testDB.DbPool, []seeder.Profile{stresstest.NewProfile()}, seeder.RunOptions{
		OrganizationIDs: []uuid.UUID{targetOrganizationID},
		UsageReporter:   reporter,
	})
	require.NoError(t, err)

	require.Greater(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM customer WHERE organization_id = $1`, targetOrganizationID), 0)
	require.Greater(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM "license" WHERE organization_id = $1`, targetOrganizationID), 0)
	require.Greater(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM entitlement WHERE organization_id = $1`, targetOrganizationID), 0)
	require.Greater(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM entitlement_group WHERE organization_id = $1`, targetOrganizationID), 0)
	require.Greater(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM entitlement_group_membership WHERE organization_id = $1`, targetOrganizationID), 0)
	require.Greater(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM instance WHERE organization_id = $1`, targetOrganizationID), 0)
	require.Greater(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM deployment_zone WHERE organization_id = $1`, targetOrganizationID), 0)
	require.Greater(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM release WHERE organization_id = $1`, targetOrganizationID), 0)
	require.Greater(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM feature_flags WHERE organization_id = $1`, targetOrganizationID), 0)
	require.Greater(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM "user" WHERE organization_id = $1 AND type = 'machine'`, targetOrganizationID), 0)

	for _, expected := range []struct {
		entitlementSlug string
		table           string
		where           string
	}{
		{entitlementSlug: dogfooding.CustomerEntitlementSlug, table: "customer"},
		{entitlementSlug: dogfooding.ComponentEntitlementSlug, table: "component"},
		{entitlementSlug: dogfooding.EntitlementEntitlementSlug, table: "entitlement"},
		{entitlementSlug: dogfooding.FeatureFlagEntitlementSlug, table: "feature_flags"},
		// The licenses quota counts products, not their versions.
		{entitlementSlug: dogfooding.LicenseEntitlementSlug, table: "license_family"},
		{entitlementSlug: dogfooding.InstanceEntitlementSlug, table: "instance"},
		{entitlementSlug: dogfooding.ReleaseEntitlementSlug, table: "release"},
		{entitlementSlug: dogfooding.DeploymentZoneEntitlementSlug, table: "deployment_zone"},
	} {
		rowCount := countRows(
			t, ctx, testDB,
			`SELECT COUNT(*) FROM `+expected.table+` WHERE organization_id = $1`+expected.where,
			targetOrganizationID,
		)
		require.Equal(t, rowCount, reporter.count(targetOrganizationID, expected.entitlementSlug), expected.entitlementSlug)
	}

	// The profile's longer families retire their oldest version. Each archived
	// version must have been withdrawn through archive-license -- one
	// LICENSE_ARCHIVED apiece, none created archived.
	archived := countRows(t, ctx, testDB, `SELECT COUNT(*) FROM "license" WHERE organization_id = $1 AND lifecycle_state = 'ARCHIVED'`, targetOrganizationID)
	require.Positive(t, archived)
	require.Equal(t, archived, countRows(t, ctx, testDB, `
		SELECT COUNT(*) FROM outbox_events WHERE organization_id = $1 AND event_name = 'LICENSE_ARCHIVED'
	`, targetOrganizationID))
	require.Zero(t, countRows(t, ctx, testDB, `
		SELECT COUNT(*) FROM outbox_events
		WHERE organization_id = $1 AND event_name = 'LICENSE_CREATED' AND data->>'lifecycleState' = 'ARCHIVED'
	`, targetOrganizationID))

	// Some instances stay on their family's first version (S3): an archived one,
	// which they were pinned to before it was withdrawn -- no instance can be
	// given an archived version (D1) -- or one still on sale behind a newer
	// version. None sits on a draft.
	require.Positive(t, countRows(t, ctx, testDB, `
		SELECT COUNT(*)
		FROM instance i
		       JOIN "license" l ON l.id = i.license_id
		WHERE i.organization_id = $1 AND l.lifecycle_state = 'ARCHIVED'
	`, targetOrganizationID))
	require.Positive(t, countRows(t, ctx, testDB, `
		SELECT COUNT(*)
		FROM instance i
		       JOIN "license" l ON l.id = i.license_id
		WHERE i.organization_id = $1 AND l.lifecycle_state = 'PUBLISHED' AND l.version = 1
		  AND EXISTS (
		    SELECT 1 FROM "license" newer
		    WHERE newer.family_id = l.family_id AND newer.version > 1 AND newer.lifecycle_state = 'PUBLISHED'
		  )
	`, targetOrganizationID))
	require.Zero(t, countRows(t, ctx, testDB, `
		SELECT COUNT(*)
		FROM instance i
		       JOIN "license" l ON l.id = i.license_id
		WHERE i.organization_id = $1 AND l.lifecycle_state = 'DRAFT'
	`, targetOrganizationID))
}

func TestRunOnlyCleansProvidedOrganizations(t *testing.T) {
	ctx := context.Background()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	targetOrganizationID := uuid.New()
	untouchedOrganizationID := uuid.New()
	createOrganizationWithMembership(t, ctx, testDB, targetOrganizationID, "Target Customer", testDB.DefaultData.UserID)
	createOrganizationWithMembership(t, ctx, testDB, untouchedOrganizationID, "Untouched Customer", testDB.DefaultData.UserID)

	insertCustomer(t, ctx, testDB, targetOrganizationID, testDB.DefaultData.UserID, "stale-target-customer", "Stale Target Customer")
	insertCustomer(t, ctx, testDB, untouchedOrganizationID, testDB.DefaultData.UserID, "preserved-customer", "Preserved Customer")
	insertEntitlementGroup(t, ctx, testDB, targetOrganizationID, "stale-target-group", "Stale Target Group")
	insertEntitlementGroup(t, ctx, testDB, untouchedOrganizationID, "preserved-group", "Preserved Group")

	err = seeder.Run(ctx, testDB.DbPool, []seeder.Profile{stresstest.NewProfile()}, seeder.RunOptions{
		OrganizationIDs: []uuid.UUID{targetOrganizationID},
	})
	require.NoError(t, err)

	require.Zero(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM customer WHERE organization_id = $1 AND slug = 'stale-target-customer'`, targetOrganizationID))
	require.Equal(t, 1, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM customer WHERE organization_id = $1 AND slug = 'preserved-customer'`, untouchedOrganizationID))
	require.Zero(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM entitlement_group WHERE organization_id = $1 AND slug = 'stale-target-group'`, targetOrganizationID))
	require.Equal(t, 1, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM entitlement_group WHERE organization_id = $1 AND slug = 'preserved-group'`, untouchedOrganizationID))
	require.Greater(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM customer WHERE organization_id = $1`, targetOrganizationID), 0)
	require.Greater(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM entitlement_group WHERE organization_id = $1`, targetOrganizationID), 0)
}

// TestRunReseedsTheDemoCatalogueOverAStaleOne reseeds an organization that
// already sells a product under a slug the demo catalogue uses. The demo's
// license slugs are fixed, and a family keeps its slug for as long as it
// exists, so the reseed only succeeds if the cleanup removed the target's
// families along with their versions -- while the same slug in an organization
// that was not named stays where it is.
func TestRunReseedsTheDemoCatalogueOverAStaleOne(t *testing.T) {
	ctx := context.Background()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	targetOrganizationID := uuid.New()
	untouchedOrganizationID := uuid.New()
	createOrganizationWithMembership(t, ctx, testDB, targetOrganizationID, "Target Restaurant Group", testDB.DefaultData.UserID)
	createOrganizationWithMembership(t, ctx, testDB, untouchedOrganizationID, "Untouched Restaurant Group", testDB.DefaultData.UserID)

	insertLicenseFamilyWithVersion(t, ctx, testDB, targetOrganizationID, "premium", "Stale Premium")
	insertLicenseFamilyWithVersion(t, ctx, testDB, untouchedOrganizationID, "premium", "Preserved Premium")

	err = seeder.Run(ctx, testDB.DbPool, []seeder.Profile{demoprofile.NewProfile()}, seeder.RunOptions{
		OrganizationIDs: []uuid.UUID{targetOrganizationID},
	})
	require.NoError(t, err)

	require.Zero(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM "license" WHERE organization_id = $1 AND name = 'Stale Premium'`, targetOrganizationID))
	require.Equal(t, 3, countRows(t, ctx, testDB, `
		SELECT COUNT(*)
		FROM "license" l
		       JOIN license_family f ON f.id = l.family_id
		WHERE f.organization_id = $1 AND f.slug = 'premium' AND l.name = 'Premium'
	`, targetOrganizationID), "the reseeded premium family is the demo's, with its three versions")
	require.Equal(t, 1, countRows(t, ctx, testDB, `
		SELECT COUNT(*)
		FROM "license" l
		       JOIN license_family f ON f.id = l.family_id
		WHERE f.organization_id = $1 AND f.slug = 'premium' AND l.name = 'Preserved Premium'
	`, untouchedOrganizationID))
}

func TestEnsureUserReconcilesStaleExternalID(t *testing.T) {
	ctx := context.Background()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	userID := uuid.New()
	_, err = testDB.DbPool.Exec(ctx, `
		INSERT INTO "user" (id, external_id, email, name)
		VALUES ($1, $2, $3, $4)
	`, userID, "user-old-clerk-id", "old@example.com", "Old Name")
	require.NoError(t, err)

	sc := seeder.NewSeederContext(testDB.DbPool, nil)
	email := "new@example.com"
	actualUserID, err := sc.EnsureUser(ctx, usersdb.CreateUserParams{
		ID:         userID,
		ExternalID: "user-new-clerk-id",
		Email:      &email,
		Name:       "New Name",
	})
	require.NoError(t, err)
	require.Equal(t, userID, actualUserID)

	var externalID, name string
	var storedEmail *string
	err = testDB.DbPool.QueryRow(ctx, `
		SELECT external_id, email, name
		FROM "user"
		WHERE id = $1
	`, userID).Scan(&externalID, &storedEmail, &name)
	require.NoError(t, err)
	require.Equal(t, "user-new-clerk-id", externalID)
	require.Equal(t, "New Name", name)
	require.NotNil(t, storedEmail)
	require.Equal(t, email, *storedEmail)
}

func TestEnsureUserReconcilesByEmailWhenClerkIDChanged(t *testing.T) {
	ctx := context.Background()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	existingUserID := uuid.New()
	_, err = testDB.DbPool.Exec(ctx, `
		INSERT INTO "user" (id, external_id, email, name)
		VALUES ($1, $2, $3, $4)
	`, existingUserID, "user-old-clerk-id", "ada@vendor.example", "Ada Old")
	require.NoError(t, err)

	sc := seeder.NewSeederContext(testDB.DbPool, nil)
	email := "ada@vendor.example"
	actualUserID, err := sc.EnsureUser(ctx, usersdb.CreateUserParams{
		ID:         uuid.New(),
		ExternalID: "user-new-clerk-id",
		Email:      &email,
		Name:       "Ada Vendor",
	})
	require.NoError(t, err)
	require.Equal(t, existingUserID, actualUserID)

	var externalID, name string
	var storedEmail *string
	err = testDB.DbPool.QueryRow(ctx, `
		SELECT external_id, email, name
		FROM "user"
		WHERE id = $1
	`, existingUserID).Scan(&externalID, &storedEmail, &name)
	require.NoError(t, err)
	require.Equal(t, "user-new-clerk-id", externalID)
	require.Equal(t, "Ada Vendor", name)
	require.NotNil(t, storedEmail)
	require.Equal(t, email, *storedEmail)
}

func TestEnsureOrganizationReconcilesStaleExternalID(t *testing.T) {
	ctx := context.Background()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	orgID := uuid.New()
	_, err = testDB.DbPool.Exec(ctx, `
		INSERT INTO organization (id, external_id, name)
		VALUES ($1, $2, $3)
	`, orgID, "org-old-clerk-id", "Old Org")
	require.NoError(t, err)

	sc := seeder.NewSeederContext(testDB.DbPool, nil)
	actualOrgID, err := sc.EnsureOrganization(ctx, organizationdb.CreateOrganizationParams{
		ID:         orgID,
		ExternalID: "org-new-clerk-id",
		Name:       "New Org",
	})
	require.NoError(t, err)
	require.Equal(t, orgID, actualOrgID)

	var externalID string
	var name string
	err = testDB.DbPool.QueryRow(ctx, `
		SELECT external_id, name
		FROM organization
		WHERE id = $1
	`, orgID).Scan(&externalID, &name)
	require.NoError(t, err)
	require.Equal(t, "org-new-clerk-id", externalID)
	require.Equal(t, "New Org", name)
}

// Organizations have no soft delete to restore — EnsureOrganization only
// reconciles external_id and name — so the organization half of this asserts
// that reconciliation, and the user half the actual undelete.
func TestEnsureRestoresSoftDeletedIdentities(t *testing.T) {
	ctx := context.Background()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	organizationID := uuid.New()
	userID := uuid.New()
	_, err = testDB.DbPool.Exec(ctx, `
		INSERT INTO organization (id, external_id, name)
		VALUES ($1, 'soft-deleted-org', 'Old Organization')
	`, organizationID)
	require.NoError(t, err)
	_, err = testDB.DbPool.Exec(ctx, `
		INSERT INTO "user" (id, external_id, email, name, deleted_at)
		VALUES ($1, 'soft-deleted-user', 'old@example.com', 'Old User', now())
	`, userID)
	require.NoError(t, err)

	sc := seeder.NewSeederContext(testDB.DbPool, nil)
	actualOrganizationID, err := sc.EnsureOrganization(ctx, organizationdb.CreateOrganizationParams{
		ID:         organizationID,
		ExternalID: "soft-deleted-org",
		Name:       "Restored Organization",
	})
	require.NoError(t, err)
	require.Equal(t, organizationID, actualOrganizationID)

	email := "restored@example.com"
	actualUserID, err := sc.EnsureUser(ctx, usersdb.CreateUserParams{
		ID:         userID,
		ExternalID: "soft-deleted-user",
		Email:      &email,
		Name:       "Restored User",
	})
	require.NoError(t, err)
	require.Equal(t, userID, actualUserID)

	require.Equal(t, 1, countRows(t, ctx, testDB, `
		SELECT COUNT(*) FROM organization
		WHERE id = $1 AND name = 'Restored Organization'
	`, organizationID))
	require.Equal(t, 1, countRows(t, ctx, testDB, `
		SELECT COUNT(*) FROM "user"
		WHERE id = $1 AND deleted_at IS NULL AND email = $2 AND name = 'Restored User'
	`, userID, email))
}

func createOrganizationWithMembership(t *testing.T, ctx context.Context, testDB *tests.TestDatabase, organizationID uuid.UUID, name string, userID uuid.UUID) {
	t.Helper()

	_, err := testDB.DbPool.Exec(ctx, `
		INSERT INTO organization (id, external_id, name)
		VALUES ($1, $2, $3)
	`, organizationID, "org_"+organizationID.String(), name)
	require.NoError(t, err)

	_, err = testDB.DbPool.Exec(ctx, `
		INSERT INTO user_on_organization (organization_id, user_id)
		VALUES ($1, $2)
	`, organizationID, userID)
	require.NoError(t, err)
}

func insertCustomer(t *testing.T, ctx context.Context, testDB *tests.TestDatabase, organizationID, userID uuid.UUID, slug, name string) {
	t.Helper()

	_, err := testDB.DbPool.Exec(ctx, `
		INSERT INTO customer (id, name, slug, created_by_id, updated_by_id, organization_id)
		VALUES ($1, $2, $3, $4, $4, $5)
	`, uuid.New(), name, slug, userID, organizationID)
	require.NoError(t, err)
}

func insertEntitlementGroup(t *testing.T, ctx context.Context, testDB *tests.TestDatabase, organizationID uuid.UUID, slug, name string) {
	t.Helper()

	_, err := testDB.DbPool.Exec(ctx, `
		INSERT INTO entitlement_group (id, name, slug, organization_id)
		VALUES ($1, $2, $3, $4)
	`, uuid.New(), name, slug, organizationID)
	require.NoError(t, err)
}

// insertLicenseFamilyWithVersion writes a license family and its one version
// directly, as data that was there before a seed run.
func insertLicenseFamilyWithVersion(t *testing.T, ctx context.Context, testDB *tests.TestDatabase, organizationID uuid.UUID, slug, name string) {
	t.Helper()

	var familyID uuid.UUID
	err := testDB.DbPool.QueryRow(ctx, `
		INSERT INTO license_family (organization_id, slug) VALUES ($1, $2) RETURNING id
	`, organizationID, slug).Scan(&familyID)
	require.NoError(t, err)

	_, err = testDB.DbPool.Exec(ctx, `
		INSERT INTO "license" (name, slug, description, type, organization_id, family_id, lifecycle_state)
		VALUES ($1, $2, 'Sold before the seed ran', 'PAID', $3, $4, 'PUBLISHED')
	`, name, slug, organizationID, familyID)
	require.NoError(t, err)
}

func countRows(t *testing.T, ctx context.Context, testDB *tests.TestDatabase, query string, args ...any) int {
	t.Helper()

	var count int
	err := testDB.DbPool.QueryRow(ctx, query, args...).Scan(&count)
	require.NoError(t, err)

	return count
}
