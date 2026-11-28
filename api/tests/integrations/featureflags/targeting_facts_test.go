package featureflags_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	customertargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/customers/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
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

// An entitlement that counts per resource reads, to a rule, as its highest
// counter: a rule cannot name one resource, an evaluation carries none, and
// "usage" is then the figure closest to the limit.
func TestGetTargetingFacts_APerResourceEntitlementIsItsHighestCounter(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	customer := newTargetingCustomer(t, "Per Resource Co")
	license := newTargetingLicense(t, "Per Resource Plan")
	instance := newTargetingInstance(t, "Per Resource Instance", customer, license)

	entitlement, err := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).CreateEntitlement(
		t.Context(),
		createentitlement.CreateEntitlementInput{
			Name: "Sources per competitor", Slug: "sources-per-competitor", Type: entitlementschema.Number,
			AggregationMethod: ptr.To(entitlementschema.Sum), LimitScope: entitlementschema.LimitScopeResource,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)
	_, err = associateentitlementwithlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB), aiusage.Policy{}).
		AssociateEntitlementToLicense(t.Context(), license.Slug, &associateentitlementwithlicense.Command{
			EntitlementSlug: entitlement.Slug, Value: map[string]any{"type": "number", "value": 4},
		}, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	for key, value := range map[string]float64{"stigg": 2, "paid": 4, "schematic": 3} {
		req := commonfixture.NewJSONRequest(t, "POST",
			"/api/instances/"+instance.Slug+"/entitlements/"+entitlement.Slug+"/resources/"+key+"/usage",
			map[string]any{"value": map[string]any{"type": "number", "value": value}, "behavior": "append"})
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		commonfixture.MustCloseBody(t, resp.Body)
	}

	for name, read := range map[string]func() ([]customertargetingfacts.TargetingFact, error){
		"by customer": func() ([]customertargetingfacts.TargetingFact, error) {
			return customertargetingfacts.New(testServer.Dependencies.DB).GetTargetingFactsByCustomerSlug(t.Context(), testDb.DefaultData.OrganizationID, customer.Slug)
		},
		"by instance": func() ([]customertargetingfacts.TargetingFact, error) {
			return customertargetingfacts.New(testServer.Dependencies.DB).GetTargetingFactsByInstance(t.Context(), testDb.DefaultData.OrganizationID, instance.ID)
		},
	} {
		facts, err := read()
		require.NoError(t, err, name)
		require.Len(t, facts, 1, name)
		require.NotNil(t, facts[0].EntitlementSlug)
		assert.Equal(t, entitlement.Slug, *facts[0].EntitlementSlug, name)
		assert.JSONEq(t, `{"type":"number","value":4}`, string(facts[0].LimitValue), name)
		var usage struct {
			Value float64 `json:"value"`
		}
		require.NoError(t, json.Unmarshal(facts[0].UsageValue, &usage), name)
		assert.Equal(t, 4.0, usage.Value, "%s: the highest counter, the one closest to the limit", name)
	}
}
