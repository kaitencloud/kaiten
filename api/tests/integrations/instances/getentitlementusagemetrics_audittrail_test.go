package instances_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestGetEntitlementUsageMetrics_AuditTrailRecording verifies that every call to
// GET /instances/{slug}/entitlements/{slug}/usage creates an outbox event for
// audit trail recording. The actual audit_trail row is written asynchronously
// by the audit trail subscriber inside the API; this test verifies the outbox event is committed.
func TestGetEntitlementUsageMetrics_AuditTrailRecording(t *testing.T) {
	t.Run("NumberEntitlement_RecordsOutboxAuditEvent", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t) // NUMBER type
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)

		// Act — call the usage endpoint
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		// Assert — outbox event created for audit trail
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		found := false
		for _, ev := range events {
			if ev.EventName == instanceEvents.EntitlementValueGet.Name {
				found = true
				break
			}
		}
		require.True(t, found, "expected outbox event %q for NUMBER entitlement GET", instanceEvents.EntitlementValueGet.Name)
	})

	t.Run("BooleanEntitlement_RecordsOutboxAuditEvent", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithType(t, entitlementschema.Boolean)
		assignBooleanEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, true)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		// Assert
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		found := false
		for _, ev := range events {
			if ev.EventName == instanceEvents.EntitlementValueGet.Name {
				found = true
				break
			}
		}
		require.True(t, found, "expected outbox event %q for BOOLEAN entitlement GET", instanceEvents.EntitlementValueGet.Name)
	})

	t.Run("ConfigEntitlement_RecordsOutboxAuditEvent", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithType(t, entitlementschema.Config)
		assignConfigEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		// Assert
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		found := false
		for _, ev := range events {
			if ev.EventName == instanceEvents.EntitlementValueGet.Name {
				found = true
				break
			}
		}
		require.True(t, found, "expected outbox event %q for CONFIG entitlement GET", instanceEvents.EntitlementValueGet.Name)
	})
}
