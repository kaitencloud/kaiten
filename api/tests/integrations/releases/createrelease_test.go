package releases_test

import (
	"encoding/json"
	"io"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/releaselink"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	releaseEvents "github.com/kaitencloud/kaiten/api/internal/modules/releases/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/getrelease"
	releasesdb "github.com/kaitencloud/kaiten/api/internal/modules/releases/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestCreateRelease(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenRequestIsValidWithoutDescription_CreatesRelease", func(t *testing.T) {
		t.Cleanup(resetDB)

		payload := schema.Release{
			Version: "v0.0.1",
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/releases", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Release](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Version, created.Version)
		require.Nil(t, created.Description)

		repo := getrelease.NewQueryRepository(releasesdb.New(testServer.Dependencies.DB), releaselink.New(testServer.Dependencies.DB))
		stored, err := repo.GetReleaseBySlug(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, payload.Version, stored.Version)
	})

	t.Run("WhenRequestIsValidWithDescription_CreatesReleaseAndOutboxEvent", func(t *testing.T) {
		t.Cleanup(resetDB)

		payload := schema.Release{
			Version:     "v1.0.0",
			Description: ptr.To("This the most stable release of all time"),
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/releases", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Release](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Version, created.Version)
		require.Equal(t, payload.Description, created.Description)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events)

		var releaseCreatedEvent *outboxdb.OutboxEvent
		for _, event := range events {
			if event.EventName == releaseEvents.ReleaseCreated.Name {
				releaseCreatedEvent = &event
				break
			}
		}
		require.NotNil(t, releaseCreatedEvent)
		assert.Equal(t, releaseEvents.ReleaseCreated.Type, releaseCreatedEvent.EventType)

		var eventData schema.Release
		err = json.Unmarshal(releaseCreatedEvent.Data, &eventData)
		require.NoError(t, err)
		assert.Equal(t, created.Version, eventData.Version)
		assert.Equal(t, created.Description, eventData.Description)
	})
}

func TestCreateReleaseWithComponentLinks(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenComponentIDsAreProvided_LinksComponents", func(t *testing.T) {
		t.Cleanup(resetDB)

		componentA := newComponent(t, "api-gateway", "v1.2.3", ptr.To("Main API gateway"))
		componentB := newComponent(t, "auth-service", "v2.0.0", ptr.To("Authentication service"))

		payload := schema.Release{
			Version:      "v1.0.0",
			Description:  ptr.To("Release with components"),
			ComponentIDs: []uuid.UUID{componentA.ID, componentB.ID},
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/releases", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Release](t, resp, fiber.StatusCreated)
		require.Len(t, created.Components, 2)

		componentNames := make(map[string]string, len(created.Components))
		for _, component := range created.Components {
			componentNames[component.Name] = component.Version
		}
		require.Equal(t, "v1.2.3", componentNames["api-gateway"])
		require.Equal(t, "v2.0.0", componentNames["auth-service"])
	})

	t.Run("WhenComponentIDsContainDuplicates_DedupesLinks", func(t *testing.T) {
		t.Cleanup(resetDB)

		component := newComponent(t, "api-gateway", "v1.2.3", nil)

		payload := schema.Release{
			Version:      "v1.0.0",
			ComponentIDs: []uuid.UUID{component.ID, component.ID, component.ID},
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/releases", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Release](t, resp, fiber.StatusCreated)
		require.Len(t, created.Components, 1)
		require.Equal(t, component.ID, created.Components[0].ID)
	})

	t.Run("WhenComponentIDDoesNotExist_Returns404", func(t *testing.T) {
		t.Cleanup(resetDB)

		payload := schema.Release{
			Version:      "v1.0.0",
			ComponentIDs: []uuid.UUID{uuid.New()},
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/releases", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenCurrentUserDoesNotBelongToOrganization_Returns403", func(t *testing.T) {
		t.Cleanup(resetDB)

		_, err := organizationdb.New(testServer.Dependencies.DB).DeleteUserOnOrganization(t.Context(), organizationdb.DeleteUserOnOrganizationParams{
			UserID:         testDb.DefaultData.UserID,
			OrganizationID: testDb.DefaultData.OrganizationID,
		})
		require.NoError(t, err)

		req := commonfixture.NewJSONRequest(t, "POST", "/api/releases", schema.Release{
			Version: "v9.9.9",
		})
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		bodyString := string(bodyBytes)

		require.Equal(t, fiber.StatusForbidden, resp.StatusCode)
		require.Contains(t, bodyString, "CurrentUser.NotInOrganization")
		require.Contains(t, bodyString, testDb.DefaultData.UserID.String())
		require.Contains(t, bodyString, testDb.DefaultData.OrganizationID.String())
		require.NotContains(t, bodyString, "no rows in result set")
	})
}
