package identity_test

import (
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createserviceaccount"
	identitydb "github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestCreateServiceAccount(t *testing.T) {
	t.Run("WhenRequestIsValid_CreatesServiceAccount", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		payload := schema.ServiceAccount{
			Name: "CI/CD",
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/service-accounts", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.ServiceAccount](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.NotNil(t, created.ID)
		require.NotEqual(t, created.ID, uuid.Nil)
		require.NotNil(t, created.CreatedBy)
		require.NotEqual(t, created.CreatedBy.ID, uuid.Nil)
		require.NotNil(t, created.ExternalID)
		require.True(
			t,
			strings.HasPrefix(created.ExternalID, "ksa_"),
			"ExternalID '%s' should start with 'ksa_' prefix",
			created.ExternalID,
		)
	})

	t.Run("WhenSlugAlreadyExistsInSameOrg_Returns409", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		payload := schema.ServiceAccount{
			Name: "CI Bot",
			Slug: "ci-bot",
		}

		req1 := commonfixture.NewJSONRequest(t, "POST", "/api/service-accounts", payload)
		resp1, err := testServer.App.Test(req1, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp1.Body)
		require.Equal(t, fiber.StatusCreated, resp1.StatusCode)

		// Act — same slug, same org
		req2 := commonfixture.NewJSONRequest(t, "POST", "/api/service-accounts", payload)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)

		// Assert
		require.Equal(t, fiber.StatusConflict, resp2.StatusCode)
	})

	t.Run("WhenSameSlugExistsInDifferentOrg_CreatesSuccessfully", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		slug := "ci-bot"
		orgID := testDb.DefaultData.OrganizationID

		_, err := identitydb.New(testServer.Dependencies.DB).CreateServiceAccount(t.Context(), identitydb.CreateServiceAccountParams{
			Name:           "CI Bot",
			Slug:           &slug,
			CreatorID:      testDb.DefaultData.UserID,
			ExternalID:     "ksa_org1_ci_bot",
			OrganizationID: &orgID,
		})
		require.NoError(t, err)

		otherOrgID, err := createOrganization(t)
		require.NoError(t, err)

		// Act — same slug, different org
		_, err = identitydb.New(testServer.Dependencies.DB).CreateServiceAccount(t.Context(), identitydb.CreateServiceAccountParams{
			Name:           "CI Bot",
			Slug:           &slug,
			CreatorID:      testDb.DefaultData.UserID,
			ExternalID:     "ksa_org2_ci_bot",
			OrganizationID: &otherOrgID,
		})

		// Assert
		require.NoError(t, err)
	})

	t.Run("WhenCreatorDoesNotExist_ReturnsNotFoundFromUseCase", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		creatorID := uuid.New()
		handler := createserviceaccount.NewUseCase(createserviceaccount.Deps{
			Uof: uow.NewUnitOfWork(testDb.DbPool),
			UserProvider: &currentuser.StaticUserProvider{
				UserID:         creatorID,
				OrganizationID: testDb.DefaultData.OrganizationID,
			},
			UsageReporter: services.NoopUsageReporter{},
		})

		_, err := handler.Execute(t.Context(), "CI/CD", nil)

		require.Error(t, err)
		require.Equal(t, 404, kaitenerrors.GetHTTPStatus(err))
	})
}
