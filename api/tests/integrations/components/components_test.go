package components_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	releaseschema "github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestComponentsCRUD(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenCreatingAStandaloneComponent_CanGetAndListIt", func(t *testing.T) {
		t.Cleanup(resetDB)

		payload := map[string]any{
			"description": "Main API gateway",
			"name":        "api-gateway",
			"version":     "v1.0.0",
		}

		createReq := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/components", payload)
		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)

		created := commonfixture.AssertJSONResponse[componentschema.Component](t, createResp, fiber.StatusCreated)
		require.Equal(t, "api-gateway", created.Name)
		require.Equal(t, "v1.0.0", created.Version)
		require.Equal(t, "Main API gateway", *created.Description)

		getReq := httptest.NewRequest(http.MethodGet, "/api/components/"+created.Slug, nil)
		getResp, err := testServer.App.Test(getReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, getResp.Body)

		fetched := commonfixture.AssertJSONResponse[componentschema.Component](t, getResp, fiber.StatusOK)
		require.Equal(t, created.ID, fetched.ID)

		listReq := httptest.NewRequest(http.MethodGet, "/api/components", nil)
		listResp, err := testServer.App.Test(listReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, listResp.Body)

		listed := commonfixture.AssertJSONResponse[pagination.Page[componentschema.Component]](t, listResp, fiber.StatusOK)
		require.Len(t, listed.Items, 1)
		require.Equal(t, created.ID, listed.Items[0].ID)
	})

	t.Run("WhenCreatingANewVersionFromPreviousComponent_SetsPreviousComponentId", func(t *testing.T) {
		t.Cleanup(resetDB)

		previous := createComponentDirectly(t, "api-gateway", "v1.0.0", nil)
		payload := map[string]any{
			"name":                "api-gateway",
			"previousComponentId": previous.ID,
			"version":             "v1.1.0",
		}

		req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/components", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[componentschema.Component](t, resp, fiber.StatusCreated)
		require.NotNil(t, created.PreviousComponentID)
		require.Equal(t, previous.ID, *created.PreviousComponentID)
		require.Equal(t, "v1.1.0", created.Version)
	})

	t.Run("WhenUpdatingAnUnlinkedComponent_UpdatesInPlace", func(t *testing.T) {
		t.Cleanup(resetDB)

		component := createComponentDirectly(t, "api-gateway", "v1.0.0", nil)
		payload := map[string]any{
			"description": "Updated description",
			"name":        "api-gateway",
			"version":     "v1.1.0",
		}

		req := commonfixture.NewJSONRequest(t, http.MethodPut, "/api/components/"+component.Slug, payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		updated := commonfixture.AssertJSONResponse[componentschema.Component](t, resp, fiber.StatusOK)
		require.Equal(t, component.ID, updated.ID)
		require.Equal(t, "v1.1.0", updated.Version)
		require.Equal(t, "Updated description", *updated.Description)
	})

	t.Run("WhenUpdatingALinkedComponent_CreatesANewVersion", func(t *testing.T) {
		t.Cleanup(resetDB)

		component := createComponentDirectly(t, "api-gateway", "v1.0.0", nil)
		releasePayload := releaseschema.Release{
			ComponentIDs: []uuid.UUID{component.ID},
			Version:      "v1.0.0",
		}

		createReleaseReq := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/releases", releasePayload)
		createReleaseResp, err := testServer.App.Test(createReleaseReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createReleaseResp.Body)

		release := commonfixture.AssertJSONResponse[releaseschema.Release](t, createReleaseResp, fiber.StatusCreated)
		require.Len(t, release.Components, 1)
		require.Equal(t, component.ID, release.Components[0].ID)

		updatePayload := map[string]any{
			"description": "Updated description",
			"name":        "api-gateway",
			"version":     "v1.1.0",
		}

		updateReq := commonfixture.NewJSONRequest(t, http.MethodPut, "/api/components/"+component.Slug, updatePayload)
		updateResp, err := testServer.App.Test(updateReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, updateResp.Body)

		updated := commonfixture.AssertJSONResponse[componentschema.Component](t, updateResp, fiber.StatusOK)
		require.NotEqual(t, component.ID, updated.ID)
		require.NotNil(t, updated.PreviousComponentID)
		require.Equal(t, component.ID, *updated.PreviousComponentID)
		require.Equal(t, "v1.1.0", updated.Version)

		getReleaseReq := httptest.NewRequest(http.MethodGet, "/api/releases/"+release.Slug, nil)
		getReleaseResp, err := testServer.App.Test(getReleaseReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, getReleaseResp.Body)

		retrievedRelease := commonfixture.AssertJSONResponse[releaseschema.Release](t, getReleaseResp, fiber.StatusOK)
		require.Len(t, retrievedRelease.Components, 1)
		require.Equal(t, component.ID, retrievedRelease.Components[0].ID)
		require.Equal(t, "v1.0.0", retrievedRelease.Components[0].Version)
	})

	t.Run("WhenDeletingALinkedComponent_ReturnsConflict", func(t *testing.T) {
		t.Cleanup(resetDB)

		component := createComponentDirectly(t, "api-gateway", "v1.0.0", nil)
		releasePayload := releaseschema.Release{
			ComponentIDs: []uuid.UUID{component.ID},
			Version:      "v1.0.0",
		}

		createReleaseReq := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/releases", releasePayload)
		createReleaseResp, err := testServer.App.Test(createReleaseReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createReleaseResp.Body)
		_ = commonfixture.AssertJSONResponse[releaseschema.Release](t, createReleaseResp, fiber.StatusCreated)

		deleteReq := httptest.NewRequest(http.MethodDelete, "/api/components/"+component.Slug, nil)
		deleteResp, err := testServer.App.Test(deleteReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, deleteResp.Body)

		require.Equal(t, fiber.StatusConflict, deleteResp.StatusCode)
	})

	t.Run("WhenDeletingAnUnlinkedComponent_RemovesIt", func(t *testing.T) {
		t.Cleanup(resetDB)

		component := createComponentDirectly(t, "api-gateway", "v1.0.0", ptr.To("Main API gateway"))

		deleteReq := httptest.NewRequest(http.MethodDelete, "/api/components/"+component.Slug, nil)
		deleteResp, err := testServer.App.Test(deleteReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, deleteResp.Body)

		require.Equal(t, fiber.StatusNoContent, deleteResp.StatusCode)

		getReq := httptest.NewRequest(http.MethodGet, "/api/components/"+component.Slug, nil)
		getResp, err := testServer.App.Test(getReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, getResp.Body)

		require.Equal(t, fiber.StatusNotFound, getResp.StatusCode)
	})
}
