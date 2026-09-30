package featureflags_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	customertargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/customers/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
)

func newTargetingCustomer(t *testing.T, name string) *customerschema.Customer {
	t.Helper()

	repo := createcustomer.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	customer, err := repo.CreateCustomer(
		t.Context(),
		name,
		slugutil.Generate(name),
		nil,
		nil,
		testDb.DefaultData.OrganizationID,
		testDb.DefaultData.UserID,
	)
	require.NoError(t, err)

	return customer
}

func newTargetingLicense(t *testing.T, name string) *licenseschema.License {
	t.Helper()

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	versionName := "v1"
	licenseSlug := slugutil.Generate(name)
	license, err := repo.CreateLicense(
		t.Context(),
		&createlicense.Command{
			Name:        name,
			Slug:        &licenseSlug,
			Description: "Targeting facts test license",
			Type:        licenseschema.Development,
			VersionName: &versionName,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return license
}

// newTargetingLicenseVersion adds the next version to the family that family
// opened. It gets the derived {familySlug}-v{n} slug, as a vendor's revision
// does, while the family keeps the first version's.
func newTargetingLicenseVersion(t *testing.T, family *licenseschema.License) *licenseschema.License {
	t.Helper()

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	version, err := repo.CreateLicense(
		t.Context(),
		&createlicense.Command{
			Name:        family.Name,
			Description: "Targeting facts test license, revised",
			Type:        family.Type,
			FamilySlug:  &family.Slug,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return version
}

func newTargetingInstance(
	t *testing.T,
	name string,
	customer *customerschema.Customer,
	license *licenseschema.License,
) *instanceschema.Instance {
	t.Helper()

	repo := createinstance.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	instanceSlug := slugutil.Generate(name)
	instance, err := repo.CreateInstance(
		t.Context(),
		&createinstance.Command{
			Name:             name,
			Slug:             &instanceSlug,
			Description:      "Targeting facts test instance",
			StartLicenseDate: time.Now(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
		},
		testDb.DefaultData.UserID,
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return instance
}

// createdAt is TIMESTAMP(3), so two instances created back to back can land in
// the same millisecond. The test states the ordering it depends on instead of
// hoping the clock produces it.
func backdateInstance(t *testing.T, instanceID uuid.UUID, at time.Time) {
	t.Helper()

	_, err := testDb.DbPool.Exec(
		t.Context(),
		`UPDATE instance SET created_at = $1 WHERE id = $2`,
		at, instanceID,
	)
	require.NoError(t, err)
}

/*
A customer's targeting facts must describe ONE instance.

Limits hang off the licence (license_entitlement.license_id) while usage hangs
off the instance (entitlement_usage keys on entitlement_id + instance_id), so
each instance spends its own allowance of the licence's threshold. Reading a
licence from one instance and a consumption from another describes a customer
that does not exist — and that is what the query did: it returned every
instance's rows, the caller keyed them by entitlement slug, and the last row
written won. The licence came from the oldest instance, the usage from the
newest.
*/
func TestGetTargetingFactsByCustomerSlug_ScopesToOneInstance(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	customer := newTargetingCustomer(t, "Two Instance Co")
	original := newTargetingLicense(t, "Targeting Starter")
	later := newTargetingLicense(t, "Targeting Scale")

	originalInstance := newTargetingInstance(t, "Original Instance", customer, original)
	laterInstance := newTargetingInstance(t, "Later Instance", customer, later)

	backdateInstance(t, originalInstance.ID, time.Now().Add(-48*time.Hour))
	backdateInstance(t, laterInstance.ID, time.Now().Add(-1*time.Hour))

	rows, err := customertargetingfacts.New(testServer.Dependencies.DB).GetTargetingFactsByCustomerSlug(
		t.Context(),
		testDb.DefaultData.OrganizationID,
		customer.Slug,
	)
	require.NoError(t, err)
	require.NotEmpty(t, rows, "a customer with instances must resolve to facts")

	// Before the fix this held rows from both licences, so the assertion below
	// is the regression: one licence, and it is the original instance's.
	for _, row := range rows {
		assert.Equal(t, original.Slug, row.LicenseSlug)
		assert.NotEqual(t, later.Slug, row.LicenseSlug)
	}
}

// A rule targets a product through familySlug, because slug names one version
// and a product's next version comes with a slug of its own. For an
// instance on a later version, the facts carry both: that version's slug, and
// its family's, which is the first version's.
func TestGetTargetingFactsByCustomerSlug_ReportsTheFamilyOfALaterVersion(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	customer := newTargetingCustomer(t, "Upgraded Co")
	first := newTargetingLicense(t, "Targeting Growth")
	second := newTargetingLicenseVersion(t, first)
	newTargetingInstance(t, "Upgraded Instance", customer, second)
	require.NotEqual(t, first.Slug, second.Slug, "a later version has a slug of its own")

	rows, err := customertargetingfacts.New(testServer.Dependencies.DB).GetTargetingFactsByCustomerSlug(
		t.Context(),
		testDb.DefaultData.OrganizationID,
		customer.Slug,
	)
	require.NoError(t, err)
	require.NotEmpty(t, rows, "a licence without entitlements still yields its row")

	for _, row := range rows {
		assert.Equal(t, second.Slug, row.LicenseSlug)
		assert.Equal(t, first.Slug, row.LicenseFamilySlug)
	}
}

// A targeting key that is not a customer slug resolves to nothing. That is the
// documented normal case — a host may target a user or a device — and it is why
// the enrichment clears the server namespace before it tries to fill it.
func TestGetTargetingFactsByCustomerSlug_UnknownKeyResolvesToNothing(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	rows, err := customertargetingfacts.New(testServer.Dependencies.DB).GetTargetingFactsByCustomerSlug(
		t.Context(),
		testDb.DefaultData.OrganizationID,
		"not-a-customer-slug",
	)
	require.NoError(t, err)
	assert.Empty(t, rows)
}
