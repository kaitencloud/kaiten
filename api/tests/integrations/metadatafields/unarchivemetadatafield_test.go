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

func TestUnarchiveMetadataField(t *testing.T) {
	resetDB := func() { require.NoError(t, testDb.Reset()) }

	archive := func(t *testing.T, id string) {
		t.Helper()
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/"+id+"/archive", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
	}

	t.Run("WhenFieldArchived_Returns200WithoutArchivedAt", func(t *testing.T) {
		t.Cleanup(resetDB)
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)
		archive(t, id.String())

		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/"+id.String()+"/unarchive", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		got := commonfixture.AssertJSONResponse[schema.MetadataField](t, resp, fiber.StatusOK)
		require.Nil(t, got.ArchivedAt, "unarchive must clear archived_at")
	})

	t.Run("WhenFieldNotArchived_Returns404", func(t *testing.T) {
		t.Cleanup(resetDB)
		// Active field — never archived.
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)

		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/"+id.String()+"/unarchive", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenActiveFieldReusedTheKey_Returns409", func(t *testing.T) {
		t.Cleanup(resetDB)
		// Archive the original "region" field, then declare a fresh active
		// field on the same key (allowed — the partial unique index only
		// covers non-archived rows). Unarchiving the original now collides.
		original := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)
		archive(t, original.String())
		insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region (new)", map[string]any{"type": "string"}, 1)

		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/"+original.String()+"/unarchive", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusConflict, resp.StatusCode)
	})
}
