package metadatafields_test

import (
	"context"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	deploymentzonesdb "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/dryrunmetadatafield"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// insertDeploymentZone seeds a deployment_zone row directly with the supplied
// raw metadata jsonb. Returns nothing — the dry-run reads them back by org.
func insertDeploymentZone(t *testing.T, name, slug, metadataJSON string) {
	t.Helper()
	_, err := deploymentzonesdb.New(testServer.Dependencies.DB).CreateDeploymentZone(context.Background(), deploymentzonesdb.CreateDeploymentZoneParams{
		Name:           name,
		Slug:           slug,
		Description:    "",
		Type:           "PRODUCTION",
		Metadata:       []byte(metadataJSON),
		OrganizationID: testDb.DefaultData.OrganizationID,
		UserID:         testDb.DefaultData.UserID,
	})
	require.NoError(t, err)
}

func TestDryRunMetadataField(t *testing.T) {
	resetDB := func() { require.NoError(t, testDb.Reset()) }

	t.Run("CountsAndSamplesResourcesThatWouldBecomeInvalid", func(t *testing.T) {
		t.Cleanup(resetDB)
		// A free-string "region" field today.
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)

		// eu passes the candidate enum; berlin does not; the third zone has no
		// region key at all and must be ignored.
		insertDeploymentZone(t, "Zone EU", "zone-eu", `{"region":"eu"}`)
		insertDeploymentZone(t, "Zone Berlin", "zone-berlin", `{"region":"berlin"}`)
		insertDeploymentZone(t, "Zone None", "zone-none", `{"tier":"gold"}`)

		body := map[string]any{
			"jsonSchema": map[string]any{"type": "string", "enum": []string{"eu", "us"}},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/"+id.String()+"/dry-run", body)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		got := commonfixture.AssertJSONResponse[dryrunmetadatafield.Impact](t, resp, fiber.StatusOK)
		assert.Equal(t, 1, got.Count)
		require.Len(t, got.Samples, 1)
		assert.Equal(t, "zone-berlin", got.Samples[0].Slug)
	})

	t.Run("WhenNoResourceImpacted_ReturnsZero", func(t *testing.T) {
		t.Cleanup(resetDB)
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)
		insertDeploymentZone(t, "Zone EU", "zone-eu", `{"region":"eu"}`)

		body := map[string]any{
			"jsonSchema": map[string]any{"type": "string", "enum": []string{"eu", "us"}},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/"+id.String()+"/dry-run", body)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		got := commonfixture.AssertJSONResponse[dryrunmetadatafield.Impact](t, resp, fiber.StatusOK)
		assert.Equal(t, 0, got.Count)
		assert.Empty(t, got.Samples)
	})

	t.Run("WhenFieldUnknown_Returns404", func(t *testing.T) {
		t.Cleanup(resetDB)
		body := map[string]any{"jsonSchema": map[string]any{"type": "string"}}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/"+uuid.NewString()+"/dry-run", body)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenCandidateSchemaMalformed_Returns422", func(t *testing.T) {
		t.Cleanup(resetDB)
		id := insertField(t, metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE, "region", "Region", map[string]any{"type": "string"}, 0)

		body := map[string]any{"jsonSchema": map[string]any{"type": "not-a-real-type"}}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/metadata-fields/"+id.String()+"/dry-run", body)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})
}
