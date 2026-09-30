package releases_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetReleaseByID(t *testing.T) {
	t.Run("WhenReleaseExists_ReturnsRelease", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		releases := createReleases(t, 1)
		expected := *releases[0]

		req := httptest.NewRequest("GET", "/api/releases/"+releases[0].Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[schema.Release](t, resp, fiber.StatusOK)
		require.Equal(t, expected.ID, actual.ID)
		require.Equal(t, expected.Version, actual.Version)
		require.Equal(t, expected.Slug, actual.Slug)
	})

	t.Run("WhenReleaseDoesNotExist_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		req := httptest.NewRequest("GET", "/api/releases/"+uuid.New().String(), nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}

func TestGetReleaseWithComponents(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenReleaseHasComponents_ReturnsReleaseWithComponents", func(t *testing.T) {
		t.Cleanup(resetDB)

		componentA := newComponent(t, "api-gateway", "v1.2.3", ptr.To("Main API gateway"))
		componentB := newComponent(t, "auth-service", "v2.0.0", ptr.To("Authentication service"))
		payload := schema.Release{
			Version:      "v1.0.0",
			Description:  ptr.To("Release with components"),
			ComponentIDs: []uuid.UUID{componentA.ID, componentB.ID},
		}

		createReq := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/releases", payload)
		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)

		created := commonfixture.AssertJSONResponse[schema.Release](t, createResp, fiber.StatusCreated)

		getReq := httptest.NewRequest(http.MethodGet, "/api/releases/"+created.Slug, nil)
		getResp, err := testServer.App.Test(getReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, getResp.Body)

		retrieved := commonfixture.AssertJSONResponse[schema.Release](t, getResp, fiber.StatusOK)
		require.Equal(t, created.ID, retrieved.ID)
		require.Equal(t, created.Version, retrieved.Version)
		require.Len(t, retrieved.Components, 2)
	})

	t.Run("WhenReleaseHasNoComponents_ReturnsEmptyComponentsArray", func(t *testing.T) {
		t.Cleanup(resetDB)

		payload := schema.Release{
			Version: "v1.0.0",
		}

		createReq := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/releases", payload)
		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)

		created := commonfixture.AssertJSONResponse[schema.Release](t, createResp, fiber.StatusCreated)

		getReq := httptest.NewRequest(http.MethodGet, "/api/releases/"+created.Slug, nil)
		getResp, err := testServer.App.Test(getReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, getResp.Body)

		retrieved := commonfixture.AssertJSONResponse[schema.Release](t, getResp, fiber.StatusOK)
		require.Equal(t, created.ID, retrieved.ID)
		require.Empty(t, retrieved.Components)
	})
}
