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

func TestArchiveMetadataField(t *testing.T) {
	resetDB := func() { require.NoError(t, testDb.Reset()) }

	t.Run("WhenFieldExists_Returns200WithArchivedAt", func(t *testing.T) {
		t.Cleanup(resetDB)
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)

		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/"+id.String()+"/archive", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		got := commonfixture.AssertJSONResponse[schema.MetadataField](t, resp, fiber.StatusOK)
		require.NotNil(t, got.ArchivedAt)
	})

	t.Run("WhenAlreadyArchived_Returns404", func(t *testing.T) {
		t.Cleanup(resetDB)
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)

		// first archive
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/"+id.String()+"/archive", nil)
		resp1, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp1.Body)

		// second attempt
		req2 := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/"+id.String()+"/archive", nil)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)
		assert.Equal(t, fiber.StatusNotFound, resp2.StatusCode)
	})
}
