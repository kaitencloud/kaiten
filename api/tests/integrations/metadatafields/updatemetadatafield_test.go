package metadatafields_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestUpdateMetadataField(t *testing.T) {
	resetDB := func() { require.NoError(t, testDb.Reset()) }

	t.Run("WhenLabelUpdated_Returns200", func(t *testing.T) {
		t.Cleanup(resetDB)
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)

		payload := map[string]any{
			"label":        "Cloud Region",
			"jsonSchema":   map[string]any{"type": "string"},
			"resourceType": metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
			"key":          "region",
		}
		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/metadata-fields/"+id.String(), payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		got := commonfixture.AssertJSONResponse[schema.MetadataField](t, resp, fiber.StatusOK)
		assert.Equal(t, "Cloud Region", got.Label)
	})

	t.Run("WhenEnumValueAdded_Returns200", func(t *testing.T) {
		t.Cleanup(resetDB)
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "tier", "Tier",
			map[string]any{"type": "string", "enum": []any{"a", "b"}}, 0)

		payload := map[string]any{
			"label":        "Tier",
			"jsonSchema":   map[string]any{"type": "string", "enum": []any{"a", "b", "c"}},
			"resourceType": metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
			"key":          "tier",
		}
		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/metadata-fields/"+id.String(), payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	})

	t.Run("WhenTypeChanged_Returns422", func(t *testing.T) {
		t.Cleanup(resetDB)
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)

		payload := map[string]any{
			"label":        "Region",
			"jsonSchema":   map[string]any{"type": "number"},
			"resourceType": metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
			"key":          "region",
		}
		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/metadata-fields/"+id.String(), payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	// The transition rules, end to end.
	// The transition rules from had only unit-test coverage; this
	// adds API-level pins for the rules most likely to bite in practice.

	t.Run("WhenCardinalityChanged_ScalarToArray_Returns422_KTN62", func(t *testing.T) {
		t.Cleanup(resetDB)
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "labels", "Labels", map[string]any{"type": "string"}, 0)
		// Wrapping a scalar into an array would invalidate every existing
		// resource that stored the original scalar value.
		payload := map[string]any{
			"label":        "Labels",
			"jsonSchema":   map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			"resourceType": metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
			"key":          "labels",
		}
		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/metadata-fields/"+id.String(), payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenEnumIntroducedOnFreeString_Returns422_KTN62", func(t *testing.T) {
		t.Cleanup(resetDB)
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)
		// Going from free `string` to `string + enum:[…]` could reject
		// values that were valid before, so it is forbidden.
		payload := map[string]any{
			"label":        "Region",
			"jsonSchema":   map[string]any{"type": "string", "enum": []any{"eu", "us"}},
			"resourceType": metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
			"key":          "region",
		}
		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/metadata-fields/"+id.String(), payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenEnumValueRemoved_Returns200_KTN62", func(t *testing.T) {
		t.Cleanup(resetDB)
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "tier", "Tier",
			map[string]any{"type": "string", "enum": []any{"gold", "silver", "bronze"}}, 0)
		// Removing an enum value is allowed (admin's call — they may have
		// already migrated data). The UI surfaces a dry-run warning.
		payload := map[string]any{
			"label":        "Tier",
			"jsonSchema":   map[string]any{"type": "string", "enum": []any{"gold", "silver"}},
			"resourceType": metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
			"key":          "tier",
		}
		req := commonfixture.NewJSONRequest(t, "PATCH", "/api/metadata-fields/"+id.String(), payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	})
}
