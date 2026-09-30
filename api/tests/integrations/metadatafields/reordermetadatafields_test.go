package metadatafields_test

import (
	"context"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestReorderMetadataFields(t *testing.T) {
	resetDB := func() { require.NoError(t, testDb.Reset()) }

	t.Run("WhenValid_Returns204AndPersistsOrder", func(t *testing.T) {
		t.Cleanup(resetDB)

		a := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "a", "A", map[string]any{"type": "string"}, 0)
		b := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "b", "B", map[string]any{"type": "string"}, 1)
		c := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "c", "C", map[string]any{"type": "string"}, 2)

		// Reorder to [c, a, b]
		payload := map[string]any{
			"ids": []uuid.UUID{c, a, b},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/reorder", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		// Verify storage: list comes back sorted by displayOrder ASC.
		rows, err := metadatafieldsdb.New(testServer.Dependencies.DB).ListMetadataFieldsByResourceType(context.Background(), metadatafieldsdb.ListMetadataFieldsByResourceTypeParams{
			OrganizationID:     testDb.DefaultData.OrganizationID,
			ResourceType:       metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
			CursorDisplayOrder: nil,
			CursorCreatedAt:    pgtype.Timestamp{},
			CursorID:           nil,
			LimitPlusOne:       100,
		})
		require.NoError(t, err)
		require.Len(t, rows, 3)
		assert.Equal(t, "c", rows[0].Key)
		assert.Equal(t, "a", rows[1].Key)
		assert.Equal(t, "b", rows[2].Key)
	})

	t.Run("WhenDuplicateID_Returns422", func(t *testing.T) {
		t.Cleanup(resetDB)
		a := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "a", "A", map[string]any{"type": "string"}, 0)

		payload := map[string]any{
			"ids": []uuid.UUID{a, a},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/reorder", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenIDDoesNotExist_Returns404", func(t *testing.T) {
		t.Cleanup(resetDB)
		ghost := uuid.New()

		payload := map[string]any{
			"ids": []uuid.UUID{ghost},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/reorder", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenMixedResourceTypes_Returns422", func(t *testing.T) {
		t.Cleanup(resetDB)
		dz := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)
		ins := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeINSTANCE, "environment", "Env", map[string]any{"type": "string"}, 0)

		payload := map[string]any{
			"ids": []uuid.UUID{dz, ins},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/reorder", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	// Reorder end to end, with archived and wrong-type entries.
	// Pin the partial-reorder semantics: passing a subset of the active
	// fields' IDs is allowed — the listed ones get the new displayOrder
	// values, the others keep theirs. This is the natural use case
	// "promote field X to the top" without forcing the caller to repeat
	// every other field.
	t.Run("WhenSubsetOfFieldsIsReordered_RemainingFieldsKeepTheirOrder_KTN62", func(t *testing.T) {
		t.Cleanup(resetDB)
		a := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "a", "A", map[string]any{"type": "string"}, 0)
		b := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "b", "B", map[string]any{"type": "string"}, 1)
		_ = insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "c", "C", map[string]any{"type": "string"}, 2)

		// Swap only a and b — c stays put.
		payload := map[string]any{"ids": []uuid.UUID{b, a}}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/reorder", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		rows, err := metadatafieldsdb.New(testServer.Dependencies.DB).ListMetadataFieldsByResourceType(context.Background(), metadatafieldsdb.ListMetadataFieldsByResourceTypeParams{
			OrganizationID:     testDb.DefaultData.OrganizationID,
			ResourceType:       metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
			CursorDisplayOrder: nil,
			CursorCreatedAt:    pgtype.Timestamp{},
			CursorID:           nil,
			LimitPlusOne:       100,
		})
		require.NoError(t, err)
		require.Len(t, rows, 3)
		// b → position 0, a → position 1, c keeps its old order=2.
		assert.Equal(t, "b", rows[0].Key)
		assert.Equal(t, "a", rows[1].Key)
		assert.Equal(t, "c", rows[2].Key)
	})

	t.Run("WhenIDIsArchived_Returns404", func(t *testing.T) {
		t.Cleanup(resetDB)
		active := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)
		archived := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "tier", "Tier", map[string]any{"type": "string"}, 1)

		// Archive one of the fields via the API to mirror real usage.
		archiveReq := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/"+archived.String()+"/archive", nil)
		archiveResp, err := testServer.App.Test(archiveReq, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, archiveResp.Body)
		require.Equal(t, fiber.StatusOK, archiveResp.StatusCode)

		payload := map[string]any{
			"ids": []uuid.UUID{active, archived},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/reorder", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}
