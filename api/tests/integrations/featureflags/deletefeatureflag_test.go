package featureflags_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	featureflagEvents "github.com/kaitencloud/kaiten/api/internal/modules/featureflags/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestDeleteFeatureFlag(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenFeatureFlagExists_DeletesFeatureFlag", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		// Create a feature flag first
		createPayload := schema.FeatureFlag{
			Name: "Feature to delete",
			Type: "boolean",
			Variants: []schema.Variant{
				{Name: "enabled", Value: true, Description: "This variant enables the feature"},
				{Name: "disabled", Value: false, Description: "This variant disables the feature"},
			},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Enabled", "true", "enabled"),
			},
			Description:    nil,
			Metadata:       map[string]any{},
			Enabled:        true,
			EventName:      "schema.delete",
			Slug:           "feature-to-delete",
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("disabled")},
		}
		createReq := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", createPayload)

		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)

		created := commonfixture.AssertJSONResponse[schema.FeatureFlag](t, createResp, fiber.StatusCreated)

		// Act
		req := httptest.NewRequest("DELETE", "/api/feature-flags/feature-to-delete", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		// Verify the feature flag was deleted (GET should return 404)
		getReq := commonfixture.NewJSONRequest(t, "GET", "/api/feature-flags/feature-to-delete", nil)
		getResp, err := testServer.App.Test(getReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, getResp.Body)
		require.Equal(t, fiber.StatusNotFound, getResp.StatusCode)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the feature flag deleted event
		var eventData schema.FeatureFlag
		found := false
		for _, event := range events {
			if event.EventName == featureflagEvents.FeatureFlagDeleted.Name {
				assert.Equal(t, featureflagEvents.FeatureFlagDeleted.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected FEATUREFLAG_DELETION event to be present")

		// Verify event data contains the deleted feature flag information
		assert.Equal(t, created.ID, eventData.ID)
		assert.Equal(t, created.Slug, eventData.Slug)
	})
}
