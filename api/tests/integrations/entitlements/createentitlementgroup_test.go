package entitlements_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestCreateEntitlementGroup(t *testing.T) {
	t.Run("WhenRequestIsValid_CreatesEntitlementGroupWithGeneratedSlug", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		payload := schema.EntitlementGroup{
			Name: "Usage quotas",
		}
		req := commonfixture.NewJSONRequest(
			t,
			"POST",
			"/api/entitlement-groups",
			payload,
		)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.EntitlementGroup](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.NotEmpty(t, created.Slug)
	})
}
