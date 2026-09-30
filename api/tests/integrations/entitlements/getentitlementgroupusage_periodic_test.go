package entitlements_test

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func newGroupUsageInstance(t *testing.T) *instanceschema.Instance {
	t.Helper()

	licenseRepo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	licenseSlug, err := slugutil.GenerateUnique("test-group-usage-license")
	require.NoError(t, err)
	versionName := "Initial"
	license, err := licenseRepo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Test License",
		Slug:        &licenseSlug,
		Description: "Test license",
		Type:        licenseschema.Development,
		VersionName: &versionName,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	customerRepo := createcustomer.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	customerSlug, err := slugutil.GenerateUnique("test-group-usage-customer")
	require.NoError(t, err)
	customer, err := customerRepo.CreateCustomer(t.Context(), "test", customerSlug, nil, nil, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID)
	require.NoError(t, err)

	instanceRepo := createinstance.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	instanceSlug, err := slugutil.GenerateUnique("test-group-usage-instance")
	require.NoError(t, err)
	instance, err := instanceRepo.CreateInstance(t.Context(), &createinstance.Command{
		Name:             "test",
		Slug:             &instanceSlug,
		Description:      "Test instance",
		StartLicenseDate: time.Now(),
		EndLicenseDate:   time.Now().AddDate(1, 0, 0),
		LicenseID:        license.ID,
		CustomerID:       customer.ID,
	}, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	return instance
}

func assignGroupUsageEntitlementToLicense(t *testing.T, licenseSlug, entitlementSlug string, threshold int32) {
	t.Helper()
	//nolint:gosec // DefaultLimitCapExceededOveragePercent only ever returns -1 or 0
	overagePercent := int16(entitlementvalue.DefaultLimitCapExceededOveragePercent(float64(threshold)))
	_, err := licensesdb.New(testServer.Dependencies.DB).AssociateEntitlementToLicense(t.Context(), licensesdb.AssociateEntitlementToLicenseParams{
		EntitlementSlug:                entitlementSlug,
		LicenseSlug:                    licenseSlug,
		Value:                          []byte(`{"type":"number","value":` + strconv.Itoa(int(threshold)) + `}`),
		LimitCapExceededOveragePercent: &overagePercent,
		OrganizationID:                 testDb.DefaultData.OrganizationID,
		UserID:                         testDb.DefaultData.UserID,
	})
	require.NoError(t, err)
}

func seedGroupUsageRow(t *testing.T, instanceID, entitlementID uuid.UUID, value float64, eventCount int32, periodStart *time.Time) {
	t.Helper()
	usageBytes, err := json.Marshal(entitlementvalue.NumberUsageValue{
		Type:       entitlementvalue.TypeNumber,
		Value:      value,
		EventCount: eventCount,
	})
	require.NoError(t, err)

	repo := reportentitlementusagemetric.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	require.NoError(t, repo.ReportEntitlementUsage(t.Context(), instanceID, entitlementID, usageBytes, testDb.DefaultData.OrganizationID, periodStart))
}

func TestGetEntitlementGroupUsage_Periodic(t *testing.T) {
	t.Run("WhenGroupHasLifetimeAndStalePeriodicMembers_EachHasCorrectBounds", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		instance := newGroupUsageInstance(t)
		group := createEntitlementGroup(t, "Quotas", "quotas-"+instance.Slug)

		lifetimeSlug, err := slugutil.GenerateUnique("lifetime-member")
		require.NoError(t, err)
		lifetimeRepo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		lifetime, err := lifetimeRepo.CreateEntitlement(t.Context(), createentitlement.CreateEntitlementInput{
			Name:              "Lifetime member",
			Slug:              lifetimeSlug,
			Type:              schema.Number,
			AggregationMethod: ptr.To(schema.Sum),
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		periodicSlug, err := slugutil.GenerateUnique("periodic-member")
		require.NoError(t, err)
		monthly := period.Month
		calendar := period.Calendar
		periodic, err := lifetimeRepo.CreateEntitlement(t.Context(), createentitlement.CreateEntitlementInput{
			Name:              "Periodic member",
			Slug:              periodicSlug,
			Type:              schema.Number,
			AggregationMethod: ptr.To(schema.Sum),
			ResetPeriod:       &monthly,
			ResetAnchor:       &calendar,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		addEntitlementToGroup(t, group.Slug, lifetime.Slug)
		addEntitlementToGroup(t, group.Slug, periodic.Slug)

		assignGroupUsageEntitlementToLicense(t, instance.LicenseSlug, lifetime.Slug, 100)
		assignGroupUsageEntitlementToLicense(t, instance.LicenseSlug, periodic.Slug, 100)

		currentWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		staleStart := currentWindow.Start.AddDate(0, -1, 0)
		seedGroupUsageRow(t, instance.ID, periodic.ID, 42, 3, &staleStart)

		req := httptest.NewRequest("GET", "/api/entitlement-groups/"+group.Slug+"/usage?instance="+instance.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		items := commonfixture.AssertJSONResponse[[]*schema.EntitlementGroupUsage](t, resp, fiber.StatusOK)
		require.Len(t, items, 2)

		byID := make(map[string]*schema.EntitlementGroupUsage, 2)
		for _, item := range items {
			byID[item.EntitlementID.String()] = item
		}

		lifetimeItem := byID[lifetime.ID.String()]
		require.NotNil(t, lifetimeItem)
		require.Nil(t, lifetimeItem.CurrentPeriodStart)

		periodicItem := byID[periodic.ID.String()]
		require.NotNil(t, periodicItem)
		require.NotNil(t, periodicItem.CurrentPeriodStart)
		require.True(t, periodicItem.CurrentPeriodStart.Equal(currentWindow.Start))

		require.NotNil(t, periodicItem.UsageValue)
		require.NotNil(t, periodicItem.UsageValue.Number)
		require.EqualValues(t, 0, periodicItem.UsageValue.Number.Value, "a stale row must read back as {0,0}")

		require.NotNil(t, periodicItem.LicenseValue)
		require.NotNil(t, periodicItem.LicenseValue.Number)
		require.EqualValues(t, 100, periodicItem.LicenseValue.Number.Value)
	})

	// usageValue/licenseValue used to be []byte, which Go marshals as a base64
	// string. This asserts the bytes actually on the wire, since a typed decode
	// alone would not tell the two apart.
	t.Run("WhenServed_UsageAndLicenseValuesAreObjectsNotBase64", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		instance := newGroupUsageInstance(t)
		group := createEntitlementGroup(t, "Quotas", "quotas-"+instance.Slug)

		memberSlug, err := slugutil.GenerateUnique("wire-shape-member")
		require.NoError(t, err)
		member, err := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).
			CreateEntitlement(t.Context(), createentitlement.CreateEntitlementInput{
				Name:              "Wire shape member",
				Slug:              memberSlug,
				Type:              schema.Number,
				AggregationMethod: ptr.To(schema.Sum),
			}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		addEntitlementToGroup(t, group.Slug, member.Slug)
		assignGroupUsageEntitlementToLicense(t, instance.LicenseSlug, member.Slug, 10)
		seedGroupUsageRow(t, instance.ID, member.ID, 7, 1, nil)

		req := httptest.NewRequest("GET", "/api/entitlement-groups/"+group.Slug+"/usage?instance="+instance.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)

		var raw []map[string]json.RawMessage
		require.NoError(t, json.Unmarshal(body, &raw))
		require.Len(t, raw, 1)

		require.JSONEq(t, `{"type":"number","value":7,"event_count":1}`, string(raw[0]["usageValue"]))
		require.JSONEq(t, `{"type":"number","value":10}`, string(raw[0]["licenseValue"]))
	})
}
