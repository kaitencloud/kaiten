package instances_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"golang.org/x/sync/errgroup"

	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestReportEntitlementUsageMetric(t *testing.T) {
	t.Run("WhenConcurrentFirstReports_PreservesEveryIncrement", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		const reportCount = 64
		var reports errgroup.Group
		for range reportCount {
			reports.Go(func() error {
				req := httptest.NewRequest(
					http.MethodPost,
					"/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage",
					strings.NewReader(`{"value":{"type":"number","value":1},"behavior":"append"}`),
				)
				req.Header.Set("Content-Type", "application/json")

				resp, err := testServer.App.Test(req, fiber.TestConfig{})
				if err != nil {
					return err
				}
				if err := resp.Body.Close(); err != nil {
					return err
				}
				if resp.StatusCode != fiber.StatusOK {
					return fmt.Errorf("report usage: unexpected status %d", resp.StatusCode)
				}
				return nil
			})
		}
		require.NoError(t, reports.Wait())

		usage, err := instancedb.New(testServer.Dependencies.DB).GetEntitlementUsageForInstance(t.Context(), instancedb.GetEntitlementUsageForInstanceParams{
			InstanceID:     instances[0].ID,
			EntitlementID:  entitlement.ID,
			OrganizationID: testDb.DefaultData.OrganizationID,
		})
		require.NoError(t, err)
		actual, err := entitlementvalue.ParseNumberUsageValue(usage.Value)
		require.NoError(t, err)
		require.EqualValues(t, reportCount, actual.Value)
		require.EqualValues(t, reportCount, actual.EventCount)
	})

	t.Run("WhenFirstReport_CreatesNewUsageMetric", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		payload := map[string]any{
			"value":    map[string]any{"type": "number", "value": 5},
			"behavior": "append",
		}

		// Act
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		start := time.Now()
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		duration := time.Since(start)
		t.Logf("Command completed in %v", duration)

		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.Equal(t, entitlement.ID, actual.EntitlementID)
		require.NotNil(t, actual.Value.Number)
		require.EqualValues(t, 5, actual.Value.Number.Value)
		require.EqualValues(t, 1, actual.Value.Number.EventCount)
		require.Equal(t, instances[0].LicenseID, actual.LicenseID)

		// Verify NO event was created on error
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)

		// Check that no INSTANCE_ENTITLEMENT_USAGE_REACHED event exists
		for _, event := range events {
			require.NotEqual(t, instanceEvents.InstanceEntitlementUsageReached.Name, event.EventName,
				"Should not have INSTANCE_ENTITLEMENT_USAGE_REACHED event when reporting below threshold")
		}
	})

	t.Run("WhenReportingExistingUsage_UpdatesValue", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		defaultUsage := int32(2)
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, defaultUsage)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		payload := map[string]any{
			"value":    map[string]any{"type": "number", "value": 1},
			"behavior": "append",
		}

		// Act
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.Equal(t, entitlement.ID, actual.EntitlementID)
		require.NotNil(t, actual.Value.Number)
		require.EqualValues(t, defaultUsage+1, actual.Value.Number.Value)
		require.EqualValues(t, 2, actual.Value.Number.EventCount)
	})

	t.Run("WhenReportingZeroValue_AcceptsValue", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 10)
		payload := map[string]any{
			"value":    map[string]any{"type": "number", "value": 1},
			"behavior": "append",
		}

		// Act
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.NotNil(t, actual.Value.Number)
		require.EqualValues(t, 1, actual.Value.Number.Value)
	})

	t.Run("WhenReportReachLimit_AcceptsValue", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		threshold := int32(10)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, threshold)
		payload := map[string]any{
			"value":    map[string]any{"type": "number", "value": threshold},
			"behavior": "append",
		}

		// Act
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		start := time.Now()
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		duration := time.Since(start)
		t.Logf("Command completed in %v", duration)

		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
	})

	t.Run("WhenReportAboveThrehsold_Return409", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		threshold := int32(10)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, threshold)
		payload := map[string]any{
			"value":    map[string]any{"type": "number", "value": threshold + 1},
			"behavior": "append",
		}

		// Act
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		start := time.Now()
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		duration := time.Since(start)
		t.Logf("Command completed in %v", duration)

		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusConflict)

		// Verify NO event was created on error
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)

		// Check that no INSTANCE_ENTITLEMENT_USAGE_REACHED event exists
		for _, event := range events {
			require.NotEqual(t, instanceEvents.InstanceEntitlementUsageReached.Name, event.EventName,
				"Should not have INSTANCE_ENTITLEMENT_USAGE_REACHED event when reporting above threshold")
		}
	})

	t.Run("WhenInstanceDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		entitlement := newEntitlement(t)
		payload := map[string]any{
			"value":    map[string]any{"type": "number", "value": 1},
			"behavior": "append",
		}

		// Act
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+uuid.New().String()+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenEntitlementDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		payload := map[string]any{
			"value":    map[string]any{"type": "number", "value": 1},
			"behavior": "append",
		}
		// Act
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+uuid.New().String()+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenReportAboveThreshold_PersistsRejectedAuditTrail", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		threshold := int32(10)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, threshold)
		payload := map[string]any{
			"value":    map[string]any{"type": "number", "value": threshold + 1},
			"behavior": "append",
		}

		// Act
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert the request was rejected.
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusConflict)

		// The REJECTED outbox event must have been committed despite the 409.
		// This verifies the transaction commits the outbox event even when usage is rejected.
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		found := false
		for _, ev := range events {
			if ev.EventName == instanceEvents.EntitlementUsageReportRejected.Name {
				found = true
				break
			}
		}
		require.True(t, found, "expected outbox event %q to be committed despite the 409", instanceEvents.EntitlementUsageReportRejected.Name)
	})

	t.Run("WhenInstanceIsDeleted_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 10)

		// Delete the instance -- DeleteInstance is a real DELETE
		deleteReq := commonfixture.NewJSONRequest(t, "DELETE", "/api/instances/"+instances[0].Slug, nil)
		deleteResp, err := testServer.App.Test(deleteReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, deleteResp.Body)
		require.Equal(t, fiber.StatusNoContent, deleteResp.StatusCode)

		payload := map[string]any{
			"value":    map[string]any{"type": "number", "value": 5},
			"behavior": "append",
		}

		// Act - Try to report usage for a soft-deleted instance
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert - Should return 404: the row is gone
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}

// reportUsage POSTs a usage report and returns the raw HTTP response; callers
// are responsible for closing the body.
func reportUsage(t *testing.T, instanceSlug, entitlementSlug string, value float64, behavior string) *http.Response {
	t.Helper()
	payload := map[string]any{
		"value":    map[string]any{"type": "number", "value": value},
		"behavior": behavior,
	}
	req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instanceSlug+"/entitlements/"+entitlementSlug+"/usage", payload)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	return resp
}

// countOutboxEvents returns how many outbox events with the given name were
// committed so far for the default test organization.
func countOutboxEvents(t *testing.T, eventName string) int {
	t.Helper()
	events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
	count := 0
	for _, ev := range events {
		if ev.EventName == eventName {
			count++
		}
	}
	return count
}

// TestReportEntitlementUsageMetric_EnforcementPolicy covers enforcement
// derived from a license grant's threshold and
// limitCapExceededOveragePercent (hard = 0, soft = >0, unlimited = -1/-1,
// with no separate enforcement-type flag), the early-warning percentage
// threshold, cap and maximum-allowed-usage crossing, and the boundary
// conditions at the base limit and at the calculated maximum.
func TestReportEntitlementUsageMetric_EnforcementPolicy(t *testing.T) {
	t.Run("WhenUsageBelowWarningThreshold_NoWarningEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 80)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000) // hard by default

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 500, "append")
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)

		require.Zero(t, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name))
	})

	t.Run("WhenUsageExactlyReachesWarningThreshold_EmitsWarningEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 80)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 800, "append")
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name))
	})

	t.Run("WhenUsageJumpsFromBelowToAboveWarningThreshold_EmitsWarningEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 80)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, 500)

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 400, "append") // 500 -> 900, crosses 800
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name))
	})

	t.Run("WhenAlreadyAboveWarningThreshold_NoRepeatedWarningEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 80)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		resp1 := reportUsage(t, instances[0].Slug, entitlement.Slug, 850, "append") // 0 -> 850, crosses 800
		commonfixture.MustCloseBody(t, resp1.Body)
		require.Equal(t, fiber.StatusOK, resp1.StatusCode)
		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name))

		resp2 := reportUsage(t, instances[0].Slug, entitlement.Slug, 50, "append") // 850 -> 900, stays above 800
		defer commonfixture.MustCloseBody(t, resp2.Body)
		require.Equal(t, fiber.StatusOK, resp2.StatusCode)

		// Still exactly one warning event committed in total across both reports.
		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name))
	})

	t.Run("WhenDisabledWarningThreshold_NeverEmitsWarningEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 0)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 1000, "append") // hits the cap exactly, would also cross an 80% boundary if enabled
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageReached.Name))
		require.Zero(t, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name))
	})

	t.Run("WhenUsageExactlyReachesCap_EmitsUsageReached", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 0)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 1000, "append")
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageReached.Name))
	})

	t.Run("WhenHardModeUsageBelowLimit_AcceptsNoEvents", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 0)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 1000, 0)

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 999, "append")
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)

		require.Zero(t, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageReached.Name))
		require.Zero(t, countOutboxEvents(t, instanceEvents.EntitlementUsageReportRejected.Name))
	})

	t.Run("WhenHardModeJumpsFromBelowToAboveCap_Returns409AndRejects", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 0)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, 500)

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 700, "append") // 500 -> 1200, jumps over the cap
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusConflict, resp.StatusCode)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.EntitlementUsageReportRejected.Name))
		require.Zero(t, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageReached.Name))
		require.Zero(t, countOutboxEvents(t, instanceEvents.InstanceEntitlementCapExceeded.Name))
	})

	t.Run("WhenSoftModeUsageBelowBaseLimit_AcceptsNoEvents", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 0)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 10, 50) // max allowed = 15

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 8, "append")
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)

		require.Zero(t, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageReached.Name))
		require.Zero(t, countOutboxEvents(t, instanceEvents.InstanceEntitlementCapExceeded.Name))
	})

	t.Run("WhenSoftModeExceedsCap_AcceptsAndPersistsOverage", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 0)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 10, 100) // max allowed = 20

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 15, "append") // 0 -> 15, over the cap of 10, within max of 20
		defer commonfixture.MustCloseBody(t, resp.Body)
		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.NotNil(t, actual.Value.Number)
		require.EqualValues(t, 15, actual.Value.Number.Value)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementCapExceeded.Name))
		require.Zero(t, countOutboxEvents(t, instanceEvents.EntitlementUsageReportRejected.Name))
	})

	t.Run("WhenSoftModeJumpsFromBelowToAboveCap_AcceptsAndEmitsCapExceeded", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 0)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 1000, 50) // max allowed = 1500
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, 500)

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 700, "append") // 500 -> 1200, jumps over the cap, within the max
		defer commonfixture.MustCloseBody(t, resp.Body)
		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.EqualValues(t, 1200, actual.Value.Number.Value)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementCapExceeded.Name))
	})

	t.Run("WhenRepeatedReportsAboveCapInSoftMode_NoRepeatedCapExceededEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 0)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 10, 100) // max allowed = 20

		resp1 := reportUsage(t, instances[0].Slug, entitlement.Slug, 15, "append") // 0 -> 15, crosses the cap
		commonfixture.MustCloseBody(t, resp1.Body)
		require.Equal(t, fiber.StatusOK, resp1.StatusCode)
		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementCapExceeded.Name))

		resp2 := reportUsage(t, instances[0].Slug, entitlement.Slug, 5, "append") // 15 -> 20, stays above the cap, exactly at the max
		defer commonfixture.MustCloseBody(t, resp2.Body)
		require.Equal(t, fiber.StatusOK, resp2.StatusCode)

		// Still exactly one cap-exceeded event committed in total across both reports.
		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementCapExceeded.Name))
	})

	t.Run("WhenSoftModeUsageExactlyAtMaximumAllowed_AcceptsValue", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 0)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 100, 20) // max allowed = 120

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 120, "append")
		defer commonfixture.MustCloseBody(t, resp.Body)
		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.EqualValues(t, 120, actual.Value.Number.Value)

		require.Zero(t, countOutboxEvents(t, instanceEvents.EntitlementUsageReportRejected.Name))
	})

	t.Run("WhenSoftModeUsageAboveMaximumAllowed_Returns409AndRejects", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 0)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 100, 20) // max allowed = 120

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 121, "append")
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusConflict, resp.StatusCode)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.EntitlementUsageReportRejected.Name))
	})

	t.Run("WhenReportCrossesBothWarningThresholdAndCap_SoftMode_EmitsBothEvents", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 80)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 1000, 50) // max allowed = 1500
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, 500)

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 700, "append") // 500 -> 1200, crosses both 800 and 1000
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name))
		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementCapExceeded.Name))
	})

	t.Run("WhenReportCrossesBothWarningThresholdAndCap_HardModeExactHit_EmitsBothEvents", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 80)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, 700)

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 300, "append") // 700 -> 1000, crosses 800 and lands exactly on the cap
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name))
		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageReached.Name))
	})

	t.Run("WhenUnlimitedEntitlement_NoCapOrWarningCrossingRegardlessOfUsage", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.Number, 80)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, -1) // unlimited; overage defaults to -1 to match

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 1_000_000, "append")
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)

		require.Zero(t, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageReached.Name))
		require.Zero(t, countOutboxEvents(t, instanceEvents.InstanceEntitlementCapExceeded.Name))
		require.Zero(t, countOutboxEvents(t, instanceEvents.InstanceEntitlementUsageWarningThresholdReached.Name))
		require.Zero(t, countOutboxEvents(t, instanceEvents.EntitlementUsageReportRejected.Name))
	})

	// NUMBER_AI_CREDIT no longer pins enforcement to SOFT: it follows the same
	// threshold/overage-percent derivation as any other NUMBER-family type, so
	// a hard-configured grant rejects usage above its limit exactly like a
	// NUMBER entitlement would.
	t.Run("WhenNumberAICreditHardLimit_Returns409AndRejects", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 10) // hard by default

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 15, "append") // over the cap of 10
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusConflict, resp.StatusCode)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.EntitlementUsageReportRejected.Name))
	})

	t.Run("WhenNumberAICreditSoftLimit_AcceptsWithinOverage", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
		assignEntitlementToLicenseWithOverage(t, instances[0].LicenseSlug, entitlement.Slug, 10, 100) // max allowed = 20

		resp := reportUsage(t, instances[0].Slug, entitlement.Slug, 15, "append") // over the cap of 10, within max of 20
		defer commonfixture.MustCloseBody(t, resp.Body)
		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.EqualValues(t, 15, actual.Value.Number.Value)

		require.Equal(t, 1, countOutboxEvents(t, instanceEvents.InstanceEntitlementCapExceeded.Name))
		require.Zero(t, countOutboxEvents(t, instanceEvents.EntitlementUsageReportRejected.Name))
	})
}
