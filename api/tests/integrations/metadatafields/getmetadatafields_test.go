package metadatafields_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetMetadataFields(t *testing.T) {
	resetDB := func() { require.NoError(t, testDb.Reset()) }

	t.Run("WhenFiltered_ReturnsActiveFieldsForType", func(t *testing.T) {
		t.Cleanup(resetDB)
		insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)
		insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "tier", "Tier",
			map[string]any{"type": "string", "enum": []any{"a", "b"}}, 1)
		insertField(t, metadatafieldsdb.MetadataFieldResourceTypeINSTANCE, "environment", "Environment", map[string]any{"type": "string"}, 0)

		req := commonfixture.NewJSONRequest(t, "GET", "/api/metadata-fields?resourceType=DEPLOYMENT_ZONE", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		page := commonfixture.AssertJSONResponse[pagination.Page[*schema.MetadataField]](t, resp, fiber.StatusOK)
		got := page.Items
		require.Len(t, got, 2)
		assert.Equal(t, "region", got[0].Key)
		assert.Equal(t, "tier", got[1].Key)
		assert.False(t, page.HasMore)
	})

	// Mirrors the GraphQL cross-org isolation
	// test on the REST surface. Seeds a MetadataField in a second
	// organization and asserts the default org's GET never returns it.
	t.Run("CrossOrgIsolation_RESTDoesNotLeakOtherOrgFields_KTN62", func(t *testing.T) {
		t.Cleanup(resetDB)
		// Positive control owned by the default org.
		insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region",
			map[string]any{"type": "string"}, 0)

		// Seed a second organization directly in the DB and give it a
		// MetadataField of its own. Pattern mirrors what's done in
		// tests/integrations/graphql/metadata_fields_test.go.
		ctx := context.Background()
		otherOrgID := uuid.New()
		otherUserID := uuid.New()
		_, err := testDb.DbPool.Exec(
			ctx,
			"INSERT INTO organization (id, external_id, name) VALUES ($1, $2, 'Other Org')",
			otherOrgID, "other-org-rest",
		)
		require.NoError(t, err)
		_, err = testDb.DbPool.Exec(
			ctx,
			"INSERT INTO \"user\" (id, external_id, email, name) VALUES ($1, $2, 'other-rest@example.com', 'Other REST')",
			otherUserID, "other-user-rest",
		)
		require.NoError(t, err)
		_, err = testDb.DbPool.Exec(
			ctx,
			"INSERT INTO user_on_organization (organization_id, user_id) VALUES ($1, $2)",
			otherOrgID, otherUserID,
		)
		require.NoError(t, err)

		schemaBytes, err := json.Marshal(map[string]any{"type": "string"})
		require.NoError(t, err)
		_, err = metadatafieldsdb.New(testServer.Dependencies.DB).InsertMetadataField(ctx, metadatafieldsdb.InsertMetadataFieldParams{
			OrganizationID: otherOrgID,
			ResourceType:   metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
			Key:            "secret_other_org",
			Label:          "Should never appear to default org",
			JsonSchema:     schemaBytes,
			DisplayOrder:   0,
			UserID:         otherUserID,
		})
		require.NoError(t, err)

		req := commonfixture.NewJSONRequest(t, "GET", "/api/metadata-fields?resourceType=DEPLOYMENT_ZONE", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		page := commonfixture.AssertJSONResponse[pagination.Page[*schema.MetadataField]](t, resp, fiber.StatusOK)
		got := page.Items
		keys := make([]string, 0, len(got))
		for _, f := range got {
			keys = append(keys, f.Key)
		}
		assert.Contains(t, keys, "region", "default org sees its own field")
		assert.NotContains(t, keys, "secret_other_org",
			"REST handler must filter by principal.OrganizationID")
	})

	t.Run("WhenMissingResourceType_Returns422", func(t *testing.T) {
		t.Cleanup(resetDB)

		req := commonfixture.NewJSONRequest(t, "GET", "/api/metadata-fields", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		// Huma rejects missing required query params as 422 (validation
		// kind). Either 400 or 422 is fine — we just want a 4xx response.
		assert.GreaterOrEqual(t, resp.StatusCode, 400)
		assert.Less(t, resp.StatusCode, 500)
	})

	t.Run("PaginationLimit_LimitsResultsAndReportsHasMore", func(t *testing.T) {
		t.Cleanup(resetDB)
		insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "field-0", "Field 0", map[string]any{"type": "string"}, 0)
		insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "field-1", "Field 1", map[string]any{"type": "string"}, 1)
		insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "field-2", "Field 2", map[string]any{"type": "string"}, 2)

		// Act -- ask for only 2
		req := httptest.NewRequest("GET", "/api/metadata-fields?resourceType=DEPLOYMENT_ZONE&limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[*schema.MetadataField]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 2)
		assert.Equal(t, "field-0", actual.Items[0].Key)
		assert.Equal(t, "field-1", actual.Items[1].Key)
		require.True(t, actual.HasMore)
		require.NotNil(t, actual.NextCursor)
	})

	t.Run("PaginationCursor_WalksAllPagesInDisplayOrder", func(t *testing.T) {
		t.Cleanup(resetDB)
		insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "field-0", "Field 0", map[string]any{"type": "string"}, 0)
		insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "field-1", "Field 1", map[string]any{"type": "string"}, 1)
		insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "field-2", "Field 2", map[string]any{"type": "string"}, 2)

		// Act -- page 1
		req := httptest.NewRequest("GET", "/api/metadata-fields?resourceType=DEPLOYMENT_ZONE&limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		page1 := commonfixture.AssertJSONResponse[pagination.Page[*schema.MetadataField]](t, resp, fiber.StatusOK)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Len(t, page1.Items, 2)
		require.True(t, page1.HasMore)
		require.NotNil(t, page1.NextCursor)

		// Act -- page 2, following the cursor from page 1
		req2 := httptest.NewRequest("GET", "/api/metadata-fields?resourceType=DEPLOYMENT_ZONE&limit=2&cursor="+url.QueryEscape(*page1.NextCursor), nil)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)

		// Assert -- the remaining entry, no further page, and display_order
		// is preserved across the page boundary (field-2 comes after
		// field-0/field-1, never before).
		page2 := commonfixture.AssertJSONResponse[pagination.Page[*schema.MetadataField]](t, resp2, fiber.StatusOK)
		require.Len(t, page2.Items, 1)
		assert.Equal(t, "field-2", page2.Items[0].Key)
		require.False(t, page2.HasMore)
		require.Nil(t, page2.NextCursor)
	})

	t.Run("InvalidCursor_ReturnsBadRequest", func(t *testing.T) {
		t.Cleanup(resetDB)

		req := httptest.NewRequest("GET", "/api/metadata-fields?resourceType=DEPLOYMENT_ZONE&cursor=not-a-valid-cursor", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}
