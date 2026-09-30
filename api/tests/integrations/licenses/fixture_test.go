package licenses_test

import (
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	addentitlementtogroup "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/addentitlementtogroup"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	createentitlementgroup "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlementgroup"
	entitlementsschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licencesschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/tests"
)

var (
	testDb     *tests.TestDatabase
	testServer *tests.TestServer
)

func TestMain(m *testing.M) {
	var err error
	testDb, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}
	defer testDb.TearDown()

	testServer = tests.NewTestServer(testDb)

	code := m.Run()
	os.Exit(code)
}

func newLicenses(t *testing.T, count int) []*licencesschema.License {
	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	licenses := make([]*licencesschema.License, 0, count)

	versionName := "Initial"

	for i := range count {
		licenseSlug := "test-license-" + strconv.Itoa(i+1)
		request := createlicense.Command{
			Name:        "Test License " + strconv.Itoa(i+1),
			Slug:        &licenseSlug,
			Description: "This is a test license " + strconv.Itoa(i+1),
			Type:        licencesschema.Development,
			VersionName: &versionName,
		}

		license, err := repo.CreateLicense(
			t.Context(),
			&request,
			testDb.DefaultData.OrganizationID,
		)
		require.NoError(t, err)
		licenses = append(licenses, license)
	}

	return licenses
}

// backdateLicense moves a license's created_at back by age. license.created_at
// is millisecond-precision, so rows inserted in a fixture loop can share an
// instant; tests that assert the chronological keyset order need the values
// spread out deterministically rather than by wall-clock luck.
func backdateLicense(t *testing.T, slug string, age time.Duration) {
	t.Helper()
	_, err := testServer.Dependencies.DB.Exec(
		t.Context(),
		`UPDATE "license" SET "created_at" = now() - make_interval(secs => $1) WHERE "slug" = $2 AND "organization_id" = $3`,
		age.Seconds(),
		slug,
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)
}

func newEntitlementWithType(t *testing.T, entitlementType entitlementsschema.Type) *entitlementsschema.Entitlement {
	repo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	description := "Test entitlement description"
	entitlementSlug := "test-entitlement"
	var aggregationMethod *entitlementsschema.AggregationMethod
	if entitlementType == entitlementsschema.Number {
		aggregationMethod = ptr.To(entitlementsschema.Sum)
	}
	entitlement, err := repo.CreateEntitlement(
		t.Context(),
		createentitlement.CreateEntitlementInput{
			Name:              "Test Entitlement",
			Slug:              entitlementSlug,
			Description:       &description,
			Type:              entitlementType,
			AggregationMethod: aggregationMethod,
		},
		testDb.DefaultData.OrganizationID,
	)

	require.NoError(t, err)

	return entitlement
}

// newLicenseEntitlementWithThreshold associates a NUMBER type entitlement with a license
func newLicenseEntitlementWithThreshold(t *testing.T, licenseSlug, entitlementSlug string, threshold int32) {
	repo := associateentitlementwithlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	request := associateentitlementwithlicense.Command{
		EntitlementSlug: entitlementSlug,
		Value: map[string]any{
			"type":  "number",
			"value": threshold,
		},
	}
	_, err := repo.AssociateEntitlementToLicense(t.Context(), licenseSlug, &request, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
}

// newLicenseEntitlementWithEnabled associates a BOOLEAN type entitlement with a license
func newLicenseEntitlementWithEnabled(t *testing.T, licenseSlug, entitlementSlug string, enabled bool) {
	repo := associateentitlementwithlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	request := associateentitlementwithlicense.Command{
		EntitlementSlug: entitlementSlug,
		Value: map[string]any{
			"type":  "boolean",
			"value": enabled,
		},
	}
	_, err := repo.AssociateEntitlementToLicense(t.Context(), licenseSlug, &request, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
}

// newLicenseEntitlementWithConfig associates a CONFIG type entitlement with a license
func newLicenseEntitlementWithConfig(t *testing.T, licenseSlug, entitlementSlug string, configValue map[string]any) {
	repo := associateentitlementwithlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	request := associateentitlementwithlicense.Command{
		EntitlementSlug: entitlementSlug,
		Value: map[string]any{
			"type":  "object",
			"value": configValue,
		},
	}
	_, err := repo.AssociateEntitlementToLicense(t.Context(), licenseSlug, &request, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
}

func newEntitlementGroup(t *testing.T, name string, slug string) *entitlementsschema.EntitlementGroup {
	repo := createentitlementgroup.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	group, err := repo.CreateEntitlementGroup(
		t.Context(),
		createentitlementgroup.CreateEntitlementGroupInput{
			Name: name,
			Slug: slug,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return group
}

func addEntitlementGroupMembership(t *testing.T, groupSlug string, entitlementSlug string) {
	repo := addentitlementtogroup.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	_, err := repo.AddEntitlementToGroup(
		t.Context(),
		groupSlug,
		entitlementSlug,
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)
}
