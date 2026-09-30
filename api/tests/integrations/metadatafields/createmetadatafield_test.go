package metadatafields_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	mfevents "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/events"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestCreateMetadataField(t *testing.T) {
	resetDB := func() { require.NoError(t, testDb.Reset()) }

	t.Run("WhenValid_Creates201AndEmitsOutbox", func(t *testing.T) {
		t.Cleanup(resetDB)

		payload := map[string]any{
			"resourceType": "DEPLOYMENT_ZONE",
			"key":          "region",
			"label":        "Region",
			"jsonSchema":   map[string]any{"type": "string"},
			"displayOrder": 0,
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.MetadataField](t, resp, fiber.StatusCreated)

		assert.Equal(t, "region", created.Key)
		assert.Equal(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, created.ResourceType)
		assert.Equal(t, "string", created.JSONSchema["type"])

		// outbox event published
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		var found bool
		for _, e := range events {
			if e.EventName == mfevents.MetadataFieldCreated.Name {
				found = true
				break
			}
		}
		assert.True(t, found, "expected METADATA_FIELD_CREATED event")
	})

	t.Run("WhenSchemaShapeInvalid_Returns422", func(t *testing.T) {
		t.Cleanup(resetDB)

		payload := map[string]any{
			"resourceType": "DEPLOYMENT_ZONE",
			"key":          "broken",
			"label":        "Broken",
			"jsonSchema":   map[string]any{"type": "not-a-type"},
			"displayOrder": 0,
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenResourceTypeInvalid_Returns422_BeforeReachingDB", func(t *testing.T) {
		t.Cleanup(resetDB)

		payload := map[string]any{
			"resourceType": "NOT_A_REAL_TYPE",
			"key":          "x",
			"label":        "X",
			"jsonSchema":   map[string]any{"type": "string"},
			"displayOrder": 0,
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		// Huma rejects out-of-enum query inputs as 422 validation failures.
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenDuplicateKey_Returns409", func(t *testing.T) {
		t.Cleanup(resetDB)

		insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)

		payload := map[string]any{
			"resourceType": "DEPLOYMENT_ZONE",
			"key":          "region",
			"label":        "Region duplicated",
			"jsonSchema":   map[string]any{"type": "string"},
			"displayOrder": 1,
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		assert.Equal(t, fiber.StatusConflict, resp.StatusCode)
	})
}
