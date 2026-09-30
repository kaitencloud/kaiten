package releases_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	componentsdb "github.com/kaitencloud/kaiten/api/internal/modules/components/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/releaselink"
	releaseEvents "github.com/kaitencloud/kaiten/api/internal/modules/releases/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/getrelease"
	releasesdb "github.com/kaitencloud/kaiten/api/internal/modules/releases/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestDeleteRelease(t *testing.T) {
	t.Run("WhenReleaseExists_DeletesRelease", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		releases := createReleases(t, 1)
		toDelete := releases[0]

		req := httptest.NewRequest("DELETE", "/api/releases/"+toDelete.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getrelease.NewQueryRepository(releasesdb.New(testServer.Dependencies.DB), releaselink.New(testServer.Dependencies.DB))
		_, err = repo.GetReleaseBySlug(t.Context(), toDelete.Slug, testDb.DefaultData.OrganizationID)
		require.Error(t, err)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events)

		var releaseDeletedEvent *outboxdb.OutboxEvent
		for _, event := range events {
			if event.EventName == releaseEvents.ReleaseDeleted.Name {
				releaseDeletedEvent = &event
				break
			}
		}
		require.NotNil(t, releaseDeletedEvent)
		assert.Equal(t, releaseEvents.ReleaseDeleted.Type, releaseDeletedEvent.EventType)

		var eventData schema.Release
		err = json.Unmarshal(releaseDeletedEvent.Data, &eventData)
		require.NoError(t, err)
		assert.Equal(t, toDelete.ID, eventData.ID)
	})

	t.Run("WhenReleaseIsDeployed_Returns409", func(t *testing.T) {
		// deployment references release with ON DELETE RESTRICT, so the
		// delete is refused by Postgres rather than cascading.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toDelete := createReleases(t, 1)[0]
		deployRelease(t, toDelete.ID)

		req := httptest.NewRequest(http.MethodDelete, "/api/releases/"+toDelete.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusConflict, resp.StatusCode, "a deployed release must be refused with 409, not 500")
	})

	t.Run("WhenReleaseDoesNotExist_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		req := httptest.NewRequest("DELETE", "/api/releases/"+uuid.New().String(), nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}

func TestDeleteReleaseWithComponents(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenReleaseIsDeleted_PreservesStandaloneComponents", func(t *testing.T) {
		t.Cleanup(resetDB)

		componentA := newComponent(t, "api-gateway", "v1.0.0", nil)
		componentB := newComponent(t, "auth-service", "v1.0.0", nil)
		payload := schema.Release{
			Version:      "v1.0.0",
			ComponentIDs: []uuid.UUID{componentA.ID, componentB.ID},
		}

		createReq := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/releases", payload)
		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)

		created := commonfixture.AssertJSONResponse[schema.Release](t, createResp, fiber.StatusCreated)

		deleteReq := httptest.NewRequest(http.MethodDelete, "/api/releases/"+created.Slug, nil)
		deleteResp, err := testServer.App.Test(deleteReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, deleteResp.Body)

		require.Equal(t, fiber.StatusNoContent, deleteResp.StatusCode)

		componentRepo := componentsdb.New(testServer.Dependencies.DB)
		storedA, err := componentRepo.GetComponentByID(t.Context(), componentsdb.GetComponentByIDParams{
			ComponentID:    componentA.ID,
			OrganizationID: testDb.DefaultData.OrganizationID,
		})
		require.NoError(t, err)
		require.Equal(t, componentA.ID, storedA.ID)

		storedB, err := componentRepo.GetComponentByID(t.Context(), componentsdb.GetComponentByIDParams{
			ComponentID:    componentB.ID,
			OrganizationID: testDb.DefaultData.OrganizationID,
		})
		require.NoError(t, err)
		require.Equal(t, componentB.ID, storedB.ID)
	})

	t.Run("WhenDeletingRelease_EventContainsLinkedComponents", func(t *testing.T) {
		t.Cleanup(resetDB)

		component := newComponent(t, "test-component", "v1.0.0", ptr.To("Test component description"))
		payload := schema.Release{
			Version:      "v1.0.0",
			ComponentIDs: []uuid.UUID{component.ID},
		}

		createReq := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/releases", payload)
		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)

		created := commonfixture.AssertJSONResponse[schema.Release](t, createResp, fiber.StatusCreated)

		deleteReq := httptest.NewRequest(http.MethodDelete, "/api/releases/"+created.Slug, nil)
		deleteResp, err := testServer.App.Test(deleteReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, deleteResp.Body)

		require.Equal(t, fiber.StatusNoContent, deleteResp.StatusCode)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)

		var releaseDeletedEvent *outboxdb.OutboxEvent
		for _, event := range events {
			if event.EventName == releaseEvents.ReleaseDeleted.Name {
				releaseDeletedEvent = &event
				break
			}
		}
		require.NotNil(t, releaseDeletedEvent)

		var eventData schema.Release
		err = json.Unmarshal(releaseDeletedEvent.Data, &eventData)
		require.NoError(t, err)

		require.Len(t, eventData.Components, 1)
		require.Equal(t, "test-component", eventData.Components[0].Name)
		require.Equal(t, "v1.0.0", eventData.Components[0].Version)
		require.Equal(t, "Test component description", *eventData.Components[0].Description)
	})
}
