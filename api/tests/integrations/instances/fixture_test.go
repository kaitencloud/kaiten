package instances_test

import (
	"encoding/json"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	auditdb "github.com/kaitencloud/kaiten/api/internal/modules/audittrail/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	deploymentzonesdb "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	entitlementsdb "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
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

func newInstances(t *testing.T, count int) []*instanceschema.Instance {
	repo := createinstance.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	instances := make([]*instanceschema.Instance, 0, count)

	license := newLicense(t)
	customer := newCustomer(t)

	for i := range count {
		slug, err := slugutil.GenerateUnique("test-" + strconv.Itoa(i))
		require.NoError(t, err)
		request := createinstance.Command{
			Name:             "test" + strconv.Itoa(i),
			Slug:             &slug,
			Description:      "Test instance " + strconv.Itoa(i),
			StartLicenseDate: time.Now(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
		}

		instance, err := repo.CreateInstance(
			t.Context(),
			&request,
			testDb.DefaultData.UserID,
			testDb.DefaultData.OrganizationID,
		)
		require.NoError(t, err)
		instances = append(instances, instance)
	}

	return instances
}

func newCustomer(t *testing.T) *customerschema.Customer {
	return newCustomerIn(t, testDb.DefaultData.OrganizationID)
}

func newCustomerIn(t *testing.T, organizationID uuid.UUID) *customerschema.Customer {
	repo := createcustomer.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	slug, err := slugutil.GenerateUnique("test")
	require.NoError(t, err)

	customer, err := repo.CreateCustomer(
		t.Context(),
		"test",
		slug,
		nil,
		nil,
		organizationID,
		testDb.DefaultData.UserID,
	)

	require.NoError(t, err)

	return customer
}

func newLicense(t *testing.T) *licenseschema.License {
	return newLicenseIn(t, testDb.DefaultData.OrganizationID)
}

func newLicenseIn(t *testing.T, organizationID uuid.UUID) *licenseschema.License {
	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	licenseSlug, err := slugutil.GenerateUnique("test-license")
	require.NoError(t, err)

	// Each call is a separate product. They may all carry the same display
	// name: 20261007000000_license_family.sql dropped the name-keyed
	// constraint, and the family is the only thing that tells them apart.
	versionName := "Initial"
	request := createlicense.Command{
		Name:        "Test License",
		Slug:        &licenseSlug,
		Description: "Test license description",
		Type:        licenseschema.Development,
		VersionName: &versionName,
	}

	license, err := repo.CreateLicense(
		t.Context(),
		&request,
		organizationID,
	)

	require.NoError(t, err)

	return license
}

func countInstances(t *testing.T) int {
	t.Helper()

	var count int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT COUNT(*) FROM instance`).Scan(&count))

	return count
}

// newNeighbourOrganization inserts a second organization and makes the
// default test user a member of it, so a test can hold a customer and a
// license the caller can legitimately see but must not be able to attach
// its own instance to.
func newNeighbourOrganization(t *testing.T) uuid.UUID {
	t.Helper()

	organizationID := uuid.New()
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `
		INSERT INTO organization (id, external_id, name)
		VALUES ($1, $2, 'Neighbour Organization')
	`, organizationID, "organization-external-"+organizationID.String())
	require.NoError(t, err)

	_, err = testServer.Dependencies.DB.Exec(t.Context(), `
		INSERT INTO user_on_organization (organization_id, user_id)
		VALUES ($1, $2)
	`, organizationID, testDb.DefaultData.UserID)
	require.NoError(t, err)

	return organizationID
}

// newEntitlement creates a NUMBER type entitlement (default for usage tracking)
func newEntitlement(t *testing.T) *entitlementschema.Entitlement {
	return newEntitlementWithType(t, entitlementschema.Number)
}

func newEntitlementWithType(t *testing.T, entitlementType entitlementschema.Type) *entitlementschema.Entitlement {
	repo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	description := "Test entitlement description"
	var aggregationMethod *entitlementschema.AggregationMethod
	if entitlementType == entitlementschema.Number {
		aggregationMethod = ptr.To(entitlementschema.Sum)
	}

	entitlementSlug, err := slugutil.GenerateUnique("test-entitlement")
	require.NoError(t, err)
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

// newEntitlementWithPolicy creates a NUMBER-family entitlement with an
// explicit warning threshold percent, for enforcement-policy tests.
// Enforcement itself (hard/soft/unlimited) is no longer set here -- it is
// derived per license grant, see assignEntitlementToLicenseWithOverage.
func newEntitlementWithPolicy(t *testing.T, entitlementType entitlementschema.Type, warningThresholdPercent int32) *entitlementschema.Entitlement {
	repo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	description := "Test entitlement description"

	entitlementSlug, err := slugutil.GenerateUnique("test-entitlement")
	require.NoError(t, err)
	entitlement, err := repo.CreateEntitlement(
		t.Context(),
		createentitlement.CreateEntitlementInput{
			Name:                    "Test Entitlement",
			Slug:                    entitlementSlug,
			Description:             &description,
			Type:                    entitlementType,
			AggregationMethod:       ptr.To(entitlementschema.Sum),
			WarningThresholdPercent: warningThresholdPercent,
		},
		testDb.DefaultData.OrganizationID,
	)

	require.NoError(t, err)

	return entitlement
}

func newEntitlementUsage(t *testing.T, instanceSlug, entitlementSlug string, value int32) {
	orgID := testDb.DefaultData.OrganizationID

	instance, err := instancedb.New(testServer.Dependencies.DB).GetOneInstance(t.Context(), instancedb.GetOneInstanceParams{
		OrganizationID: orgID,
		Slug:           instanceSlug,
	})
	require.NoError(t, err)

	entitlement, err := entitlementsdb.New(testServer.Dependencies.DB).GetEntitlement(t.Context(), entitlementsdb.GetEntitlementParams{
		OrganizationID: orgID,
		Slug:           entitlementSlug,
	})
	require.NoError(t, err)

	repo := reportentitlementusagemetric.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	usageBytes, err := json.Marshal(entitlementvalue.NumberUsageValue{
		Type:       entitlementvalue.TypeNumber,
		Value:      float64(value),
		EventCount: 1,
	})
	require.NoError(t, err)

	err = repo.ReportEntitlementUsage(
		t.Context(),
		instance.ID,
		entitlement.ID,
		usageBytes,
		orgID,
		nil,
	)

	require.NoError(t, err)
}

// assignEntitlementToLicense assigns a NUMBER type entitlement with
// threshold. limit_cap_exceeded_overage_percent is set to its default: -1
// (unlimited) when threshold is -1, 0 (hard limit) otherwise -- this bypasses
// the associateentitlementwithlicense repository (which would resolve that
// default itself), so it is computed here instead.
func assignEntitlementToLicense(t *testing.T, licenseSlug, entitlementSlug string, threshold int32) {
	overagePercent := entitlementvalue.DefaultLimitCapExceededOveragePercent(float64(threshold))
	//nolint:gosec // DefaultLimitCapExceededOveragePercent only ever returns -1 or 0
	dbOveragePercent := int16(overagePercent)
	_, err := licensesdb.New(testServer.Dependencies.DB).AssociateEntitlementToLicense(t.Context(), licensesdb.AssociateEntitlementToLicenseParams{
		EntitlementSlug:                entitlementSlug,
		LicenseSlug:                    licenseSlug,
		Value:                          []byte(`{"type":"number","value":` + strconv.Itoa(int(threshold)) + `}`),
		LimitCapExceededOveragePercent: &dbOveragePercent,
		OrganizationID:                 testDb.DefaultData.OrganizationID,
		UserID:                         testDb.DefaultData.UserID,
	})

	require.NoError(t, err)
}

// assignEntitlementToLicenseWithOverage assigns a NUMBER type entitlement
// with an explicit threshold and limit_cap_exceeded_overage_percent, for
// enforcement-policy tests that need to control hard (0), soft (>0), or
// unlimited (threshold=-1, overagePercent=-1) behavior directly.
func assignEntitlementToLicenseWithOverage(t *testing.T, licenseSlug, entitlementSlug string, threshold, overagePercent int32) {
	repo := associateentitlementwithlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	command := associateentitlementwithlicense.Command{
		EntitlementSlug: entitlementSlug,
		Value: map[string]any{
			"type":  "number",
			"value": threshold,
		},
		LimitCapExceededOveragePercent: &overagePercent,
	}
	_, err := repo.AssociateEntitlementToLicense(t.Context(), licenseSlug, &command, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
}

func assignBooleanEntitlementToLicense(t *testing.T, licenseSlug, entitlementSlug string, value bool) {
	boolStr := "false"
	if value {
		boolStr = "true"
	}
	_, err := licensesdb.New(testServer.Dependencies.DB).AssociateEntitlementToLicense(t.Context(), licensesdb.AssociateEntitlementToLicenseParams{
		EntitlementSlug: entitlementSlug,
		LicenseSlug:     licenseSlug,
		Value:           []byte(`{"type":"boolean","value":` + boolStr + `}`),
		// LimitCapExceededOveragePercent is only meaningful for a numeric
		// value; nil satisfies license_entitlement_overage_percent_number_only_check.
		LimitCapExceededOveragePercent: nil,
		OrganizationID:                 testDb.DefaultData.OrganizationID,
		UserID:                         testDb.DefaultData.UserID,
	})
	require.NoError(t, err)
}

func assignConfigEntitlementToLicense(t *testing.T, licenseSlug, entitlementSlug string) {
	_, err := licensesdb.New(testServer.Dependencies.DB).AssociateEntitlementToLicense(t.Context(), licensesdb.AssociateEntitlementToLicenseParams{
		EntitlementSlug: entitlementSlug,
		LicenseSlug:     licenseSlug,
		Value:           []byte(`{"type":"object","value":{"key":"val"}}`),
		// LimitCapExceededOveragePercent is only meaningful for a numeric
		// value; nil satisfies license_entitlement_overage_percent_number_only_check.
		LimitCapExceededOveragePercent: nil,
		OrganizationID:                 testDb.DefaultData.OrganizationID,
		UserID:                         testDb.DefaultData.UserID,
	})
	require.NoError(t, err)
}

func newAuditTrailEntry(t *testing.T, instanceSlug, eventName string) {
	t.Helper()
	instance, err := instancedb.New(testServer.Dependencies.DB).GetOneInstance(t.Context(), instancedb.GetOneInstanceParams{
		OrganizationID: testDb.DefaultData.OrganizationID,
		Slug:           instanceSlug,
	})
	require.NoError(t, err)

	queries := auditdb.New(testDb.DbPool)
	now := time.Now()
	_, err = queries.CreateAuditTrail(t.Context(), auditdb.CreateAuditTrailParams{
		OrganizationID: testDb.DefaultData.OrganizationID,
		InstanceID:     &instance.ID,
		EventName:      eventName,
		EventType:      "com.kaiten.instance.entitlement.v1.value_get",
		OccurredAt:     pgtime.TimePtrToPgTimestamptz(&now),
		Payload:        []byte(`{}`),
	})
	require.NoError(t, err)
}

// DeploymentZoneFixture represents a deployment zone for testing
type DeploymentZoneFixture struct {
	ID   uuid.UUID
	Name string
	Slug string
}

func newDeploymentZone(t *testing.T) *DeploymentZoneFixture {
	return newDeploymentZoneIn(t, testDb.DefaultData.OrganizationID)
}

func newDeploymentZoneIn(t *testing.T, organizationID uuid.UUID) *DeploymentZoneFixture {
	slug, err := slugutil.GenerateUnique("test-deployment-zone")
	require.NoError(t, err)

	dz, err := deploymentzonesdb.New(testServer.Dependencies.DB).CreateDeploymentZone(t.Context(), deploymentzonesdb.CreateDeploymentZoneParams{
		Name:           "Test Deployment Zone",
		Slug:           slug,
		Description:    "Test deployment zone for integration tests",
		Type:           "kubernetes",
		Metadata:       []byte(`{}`),
		OrganizationID: organizationID,
		UserID:         testDb.DefaultData.UserID,
	})
	require.NoError(t, err)

	return &DeploymentZoneFixture{
		ID:   dz.ID,
		Name: dz.Name,
		Slug: dz.Slug,
	}
}
