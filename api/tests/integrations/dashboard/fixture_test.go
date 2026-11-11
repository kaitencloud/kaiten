package dashboard_test

import (
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	auditdb "github.com/kaitencloud/kaiten/api/internal/modules/audittrail/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
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

// newInstances creates count instances of one customer on one license, the
// way the instances fixture does.
func newInstances(t *testing.T, count int) []*instanceschema.Instance {
	t.Helper()
	repo := createinstance.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	instances := make([]*instanceschema.Instance, 0, count)

	license := newLicense(t)
	customer := newCustomer(t)

	for i := range count {
		slug, err := slugutil.GenerateUnique("dashboard-" + strconv.Itoa(i))
		require.NoError(t, err)
		request := createinstance.Command{
			Name:             "Dashboard instance " + strconv.Itoa(i),
			Slug:             &slug,
			Description:      "Dashboard test instance " + strconv.Itoa(i),
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
	t.Helper()
	repo := createcustomer.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	slug, err := slugutil.GenerateUnique("dashboard-customer")
	require.NoError(t, err)

	customer, err := repo.CreateCustomer(
		t.Context(),
		"Dashboard customer",
		slug,
		nil,
		nil,
		testDb.DefaultData.OrganizationID,
		testDb.DefaultData.UserID,
	)
	require.NoError(t, err)

	return customer
}

func newLicense(t *testing.T) *licenseschema.License {
	t.Helper()
	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	licenseSlug, err := slugutil.GenerateUnique("dashboard-license")
	require.NoError(t, err)

	versionName := "Initial"
	request := createlicense.Command{
		Name:        "Dashboard License",
		Slug:        &licenseSlug,
		Description: "Dashboard test license",
		Type:        licenseschema.Development,
		VersionName: &versionName,
	}

	license, err := repo.CreateLicense(t.Context(), &request, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	return license
}

// newEntitlement creates a lifetime NUMBER entitlement that warns at
// warningThresholdPercent; 0 configures no warning.
func newEntitlement(t *testing.T, warningThresholdPercent int32) *entitlementschema.Entitlement {
	t.Helper()
	return newEntitlementWith(t, warningThresholdPercent, nil, nil)
}

// newPeriodicEntitlement creates a NUMBER entitlement whose usage resets every
// calendar month.
func newPeriodicEntitlement(t *testing.T, warningThresholdPercent int32) *entitlementschema.Entitlement {
	t.Helper()
	return newEntitlementWith(t, warningThresholdPercent, ptr.To(period.Month), ptr.To(period.Calendar))
}

func newEntitlementWith(t *testing.T, warningThresholdPercent int32, resetPeriod *period.ResetPeriod, resetAnchor *period.ResetAnchor) *entitlementschema.Entitlement {
	t.Helper()
	repo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	description := "Dashboard test entitlement"
	entitlementSlug, err := slugutil.GenerateUnique("dashboard-entitlement")
	require.NoError(t, err)
	entitlement, err := repo.CreateEntitlement(
		t.Context(),
		createentitlement.CreateEntitlementInput{
			Name:                    "Dashboard Entitlement",
			Slug:                    entitlementSlug,
			Description:             &description,
			Type:                    entitlementschema.Number,
			AggregationMethod:       ptr.To(entitlementschema.Sum),
			WarningThresholdPercent: warningThresholdPercent,
			ResetPeriod:             resetPeriod,
			ResetAnchor:             resetAnchor,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return entitlement
}

// grant gives the license the entitlement with a numeric threshold and the
// allowance over it: 0 is a hard limit, more a soft one, -1 no limit.
func grant(t *testing.T, licenseSlug, entitlementSlug string, threshold, overagePercent int32) {
	t.Helper()
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

// newAuditTrailEntry records an event on an instance as of now, the way the
// audit trail receives one; the dashboard reads the refused reports and the
// value reads from there.
func newAuditTrailEntry(t *testing.T, instanceSlug, eventName string) {
	t.Helper()
	newAuditTrailEntryAt(t, instanceSlug, eventName, time.Now())
}

// newAuditTrailEntryAt records eventName on instanceSlug's trail at occurredAt.
func newAuditTrailEntryAt(t *testing.T, instanceSlug, eventName string, occurredAt time.Time) {
	t.Helper()
	instance, err := instancedb.New(testServer.Dependencies.DB).GetOneInstance(t.Context(), instancedb.GetOneInstanceParams{
		OrganizationID: testDb.DefaultData.OrganizationID,
		Slug:           instanceSlug,
	})
	require.NoError(t, err)

	_, err = auditdb.New(testDb.DbPool).CreateAuditTrail(t.Context(), auditdb.CreateAuditTrailParams{
		OrganizationID: testDb.DefaultData.OrganizationID,
		InstanceID:     &instance.ID,
		ActorID:        &testDb.DefaultData.UserID,
		EventName:      eventName,
		EventType:      "com.kaiten.instance.entitlement.v1.usage_reported",
		OccurredAt:     pgtime.TimePtrToPgTimestamptz(&occurredAt),
		Payload:        []byte(`{}`),
	})
	require.NoError(t, err)
}

// scopedServer serves the same database to a caller holding only scopes.
func scopedServer(t *testing.T, scopes ...string) *tests.TestServer {
	t.Helper()
	require.NotEmpty(t, scopes, "scopedServer needs at least one scope")
	server := tests.NewTestServer(testDb, tests.TestServerOptions{Scopes: scopes})
	t.Cleanup(func() { require.NoError(t, server.Close()) })
	return server
}

// closeUsageWindow moves the stored usage window of an instance's entitlement
// back one month, the way a window looks once the calendar moved on and no
// report came to roll it over.
func closeUsageWindow(t *testing.T, instanceSlug, entitlementSlug string) {
	t.Helper()
	tag, err := testServer.Dependencies.DB.Exec(t.Context(), `
		UPDATE entitlement_usage eu
		SET period_start = eu.period_start - interval '1 month'
		FROM instance i, entitlement e
		WHERE eu.instance_id = i.id AND eu.entitlement_id = e.id
		  AND i.slug = $1 AND e.slug = $2 AND eu.organization_id = $3`,
		instanceSlug, entitlementSlug, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	require.EqualValues(t, 1, tag.RowsAffected())
}
