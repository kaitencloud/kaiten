package featureflags_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	featureflagEvents "github.com/kaitencloud/kaiten/api/internal/modules/featureflags/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestUpdateFeatureFlag(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenRequestIsValid_UpdatesFeatureFlag", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		createPayload := schema.FeatureFlag{
			Name: "Initial featureflag",
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
			EventName:      "schema.initial",
			Slug:           "initial-featureflag",
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("disabled")},
		}
		createReq := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", createPayload)

		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)

		commonfixture.AssertJSONResponse[schema.FeatureFlag](t, createResp, fiber.StatusCreated)

		// Now prepare an update payload
		updatePayload := schema.FeatureFlag{
			Name: "Updated featureflag",
			Type: "boolean",
			Variants: []schema.Variant{
				{Name: "on", Value: true, Description: "Renamed enabled variant"},
				{Name: "off", Value: false, Description: "Renamed disabled variant"},
			},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Updated rule", "user.id > 100", "on"),
			},
			Description:    ptr.To("Updated description"),
			Metadata:       map[string]any{"owner": "team-core"},
			Enabled:        false,
			EventName:      "schema.updated",
			Slug:           "updated-featureflag",
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("on")},
		}

		updateReq := commonfixture.NewJSONRequest(t, "PUT", "/api/feature-flags/initial-featureflag", updatePayload)

		// Act
		updateResp, err := testServer.App.Test(updateReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, updateResp.Body)

		// Assert
		require.Equal(t, http.StatusNoContent, updateResp.StatusCode)
		getReq := commonfixture.NewJSONRequest(t, "GET", "/api/feature-flags/updated-featureflag", nil)
		getResp, err := testServer.App.Test(getReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, getResp.Body)
		require.Equal(t, http.StatusOK, getResp.StatusCode)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the feature flag updated event
		var eventData schema.FeatureFlag
		found := false
		for _, event := range events {
			if event.EventName == featureflagEvents.FeatureFlagUpdated.Name {
				assert.Equal(t, featureflagEvents.FeatureFlagUpdated.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected FEATUREFLAG_UPDATE event to be present")

		// Verify event data contains the updated feature flag
		assert.Equal(t, "Updated featureflag", eventData.Name)
		assert.Equal(t, "updated-featureflag", eventData.Slug)
		assert.Equal(t, "schema.updated", eventData.EventName)
		assert.False(t, eventData.Enabled)
	})

	t.Run("WhenMembershipIsSoftDeleted_Returns404AndLeavesTheFlagByteIdentical", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		createPayload := schema.FeatureFlag{
			Name: "Kill switch",
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
			EventName:      "schema.killswitch",
			Slug:           "kill-switch",
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("disabled")},
		}
		createReq := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", createPayload)
		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)
		created := commonfixture.AssertJSONResponse[schema.FeatureFlag](t, createResp, fiber.StatusCreated)

		// Feature flags are the product's kill switches; an ex-member must
		// not be able to flip one.
		_, err = organizationdb.New(testServer.Dependencies.DB).DeleteUserOnOrganization(t.Context(), organizationdb.DeleteUserOnOrganizationParams{
			UserID:         testDb.DefaultData.UserID,
			OrganizationID: testDb.DefaultData.OrganizationID,
		})
		require.NoError(t, err)

		const snapshotQuery = `SELECT to_jsonb(ff) FROM feature_flags ff WHERE slug = $1 AND organization_id = $2`
		before := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, created.Slug, testDb.DefaultData.OrganizationID)

		updatePayload := createPayload
		updatePayload.Name = "Flipped by an ex-member"
		updatePayload.Enabled = false
		updateReq := commonfixture.NewJSONRequest(t, "PUT", "/api/feature-flags/"+created.Slug, updatePayload)

		// Act
		updateResp, err := testServer.App.Test(updateReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, updateResp.Body)

		// Assert
		require.Equal(t, http.StatusNotFound, updateResp.StatusCode)
		after := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, created.Slug, testDb.DefaultData.OrganizationID)
		require.Equal(t, before, after, "a soft-deleted membership must not be able to edit a feature flag")
	})
}
