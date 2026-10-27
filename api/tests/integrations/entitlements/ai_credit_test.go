package entitlements_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestAICreditPoolRequiresSum(t *testing.T) {
	aiServer := tests.NewTestServer(testDb, tests.TestServerOptions{ConfigOverride: func(cfg *config.Config) { cfg.AIUsage.Enabled = true }})
	t.Cleanup(func() { require.NoError(t, aiServer.Close()) })
	for _, aggregation := range []schema.AggregationMethod{schema.Count, schema.Average, schema.Max, schema.Min, schema.Latest} {
		t.Run("create/"+string(aggregation), func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", schema.Entitlement{
				Name: "AI Pool", Type: ptr.To(schema.NumberAICredit), AggregationMethod: ptr.To(aggregation),
			})
			resp, err := aiServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, resp.Body)
			problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, resp, fiber.StatusUnprocessableEntity)
			require.Equal(t, "CreateEntitlement.AiCreditPoolRequiresSum", problem.Code)
		})
	}
	t.Run("default sum and update refusal", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{Name: "AI Pool", Type: ptr.To(schema.NumberAICredit)}
		resp, err := aiServer.App.Test(commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Equal(t, ptr.To(schema.Sum), created.AggregationMethod)
		payload.AggregationMethod = ptr.To(schema.Max)
		updated, err := aiServer.App.Test(commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+created.Slug, payload), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, updated.Body)
		problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, updated, fiber.StatusUnprocessableEntity)
		require.Equal(t, "UpdateEntitlement.AiCreditPoolRequiresSum", problem.Code)
	})
}
