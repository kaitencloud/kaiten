package entitlements_test

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlement"
	entitlementsdb "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestCreateEntitlement_ResetPeriod(t *testing.T) {
	t.Run("WhenPeriodAndAnchorSet_CreatesConfigured", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:              "Monthly quota",
			Type:              ptr.To(schema.Number),
			AggregationMethod: ptr.To(schema.Sum),
			ResetPeriod:       ptr.To(period.Month),
			ResetAnchor:       ptr.To(period.LicenseStart),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.NotNil(t, created.ResetPeriod)
		require.Equal(t, period.Month, *created.ResetPeriod)
		require.NotNil(t, created.ResetAnchor)
		require.Equal(t, period.LicenseStart, *created.ResetAnchor)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetEntitlement(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, created.ResetPeriod, stored.ResetPeriod)
		require.Equal(t, created.ResetAnchor, stored.ResetAnchor)
	})

	t.Run("WhenAnchorOmitted_DefaultsToCalendar", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:              "Hourly quota",
			Type:              ptr.To(schema.Number),
			AggregationMethod: ptr.To(schema.Count),
			ResetPeriod:       ptr.To(period.Hour),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.NotNil(t, created.ResetAnchor)
		require.Equal(t, period.Calendar, *created.ResetAnchor)
	})

	t.Run("WhenAnchorWithoutPeriod_Returns400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:              "Bad config",
			Type:              ptr.To(schema.Number),
			AggregationMethod: ptr.To(schema.Sum),
			ResetAnchor:       ptr.To(period.Calendar),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("WhenBooleanWithResetPeriod_Returns400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:        "Bad boolean",
			Type:        ptr.To(schema.Boolean),
			ResetPeriod: ptr.To(period.Month),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("WhenLatestAggregationWithResetPeriod_Returns400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:              "Latest quota",
			Type:              ptr.To(schema.Number),
			AggregationMethod: ptr.To(schema.Latest),
			ResetPeriod:       ptr.To(period.Month),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("WhenNumberAICreditWithResetPeriod_Creates", func(t *testing.T) {
		aiServer := tests.NewTestServer(testDb, tests.TestServerOptions{ConfigOverride: func(cfg *config.Config) { cfg.AIUsage.Enabled = true }})
		t.Cleanup(func() { require.NoError(t, aiServer.Close()) })
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:              "AI credits monthly",
			Type:              ptr.To(schema.NumberAICredit),
			AggregationMethod: ptr.To(schema.Sum),
			ResetPeriod:       ptr.To(period.Month),
			ResetAnchor:       ptr.To(period.Calendar),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := aiServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.NotNil(t, created.ResetPeriod)
		require.Equal(t, period.Month, *created.ResetPeriod)
	})
}

func createNumberEntitlement(t *testing.T, slug string) *schema.Entitlement {
	t.Helper()
	payload := schema.Entitlement{
		Name:              "Lifetime " + slug,
		Slug:              slug,
		Type:              ptr.To(schema.Number),
		AggregationMethod: ptr.To(schema.Sum),
	}
	req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	return ptr.To(commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated))
}

func createPeriodicEntitlement(t *testing.T, slug string, resetPeriod period.ResetPeriod, resetAnchor period.ResetAnchor) *schema.Entitlement {
	t.Helper()
	payload := schema.Entitlement{
		Name:              "Periodic " + slug,
		Slug:              slug,
		Type:              ptr.To(schema.Number),
		AggregationMethod: ptr.To(schema.Sum),
		ResetPeriod:       &resetPeriod,
		ResetAnchor:       &resetAnchor,
	}
	req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	return ptr.To(commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated))
}

// TestEntitlement_BillingPeriodAnchor: BILLING_PERIOD is accepted with MONTH
// or YEAR, on create and when a lifetime entitlement adopts its reset period;
// any other cadence answers 422 .InvalidResetAnchor (V32-04).
func TestEntitlement_BillingPeriodAnchor(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	post := func(payload any) *http.Response {
		t.Helper()
		resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload), fiber.TestConfig{})
		require.NoError(t, err)
		t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
		return resp
	}

	created := commonfixture.AssertJSONResponse[schema.Entitlement](t, post(schema.Entitlement{
		Name: "API calls", Type: ptr.To(schema.Number), AggregationMethod: ptr.To(schema.Sum),
		ResetPeriod: ptr.To(period.Month), ResetAnchor: ptr.To(period.BillingPeriod),
	}), fiber.StatusCreated)
	require.Equal(t, period.BillingPeriod, *created.ResetAnchor)

	refused := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, post(schema.Entitlement{
		Name: "Daily calls", Type: ptr.To(schema.Number), AggregationMethod: ptr.To(schema.Sum),
		ResetPeriod: ptr.To(period.Day), ResetAnchor: ptr.To(period.BillingPeriod),
	}), fiber.StatusUnprocessableEntity)
	require.Equal(t, "CreateEntitlement.InvalidResetAnchor", refused.Code)

	lifetime := createNumberEntitlement(t, "adopts-billing-period")
	put := func(resetPeriod string) *http.Response {
		t.Helper()
		resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+lifetime.Slug, map[string]any{
			"name": lifetime.Name, "description": "", "aggregationMethod": "SUM",
			"resetPeriod": resetPeriod, "resetAnchor": "BILLING_PERIOD",
		}), fiber.TestConfig{})
		require.NoError(t, err)
		t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
		return resp
	}
	require.Equal(t, "UpdateEntitlement.InvalidResetAnchor",
		commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, put("WEEK"), fiber.StatusUnprocessableEntity).Code)
	require.Equal(t, fiber.StatusNoContent, put("YEAR").StatusCode)
}

func TestUpdateEntitlement_ResetPeriod(t *testing.T) {
	t.Run("WhenEnablingFirstTime_Succeeds", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toUpdate := createNumberEntitlement(t, "enable-first-time")

		payload := map[string]any{
			"name":              toUpdate.Name,
			"description":       "",
			"aggregationMethod": "SUM",
			"resetPeriod":       "MONTH",
			"resetAnchor":       "CALENDAR",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.ResetPeriod)
		require.Equal(t, period.Month, *updated.ResetPeriod)
		require.NotNil(t, updated.ResetAnchor)
		require.Equal(t, period.Calendar, *updated.ResetAnchor)
	})

	t.Run("WhenEnablingWithoutAnchor_DefaultsToCalendar", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toUpdate := createNumberEntitlement(t, "enable-default-anchor")

		payload := map[string]any{
			"name":              toUpdate.Name,
			"description":       "",
			"aggregationMethod": "SUM",
			"resetPeriod":       "WEEK",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.ResetAnchor)
		require.Equal(t, period.Calendar, *updated.ResetAnchor)
	})

	t.Run("WhenEchoingSameValue_Succeeds", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toUpdate := createPeriodicEntitlement(t, "echo-same", period.Month, period.Calendar)

		payload := map[string]any{
			"name":              "Renamed periodic",
			"description":       "",
			"aggregationMethod": "SUM",
			"resetPeriod":       "MONTH",
			"resetAnchor":       "CALENDAR",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, "Renamed periodic", updated.Name)
		require.NotNil(t, updated.ResetPeriod)
		require.Equal(t, period.Month, *updated.ResetPeriod)
	})

	t.Run("WhenChangingConfiguredPeriod_Returns400ImmutableResetPeriod", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toUpdate := createPeriodicEntitlement(t, "change-period", period.Month, period.Calendar)

		payload := map[string]any{
			"name":              toUpdate.Name,
			"description":       "",
			"aggregationMethod": "SUM",
			"resetPeriod":       "WEEK",
			"resetAnchor":       "CALENDAR",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		unchanged, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, unchanged.ResetPeriod)
		require.Equal(t, period.Month, *unchanged.ResetPeriod)
	})

	t.Run("WhenOmittingConfiguredPeriod_Returns400ImmutableResetPeriod", func(t *testing.T) {
		// PUT is full-replace everywhere else, but reset_period/reset_anchor are
		// a one-way door: omitting them once configured must be rejected as an
		// attempted removal, not silently clear them like units/icon do.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toUpdate := createPeriodicEntitlement(t, "omit-period", period.Month, period.Calendar)

		payload := map[string]any{
			"name":              toUpdate.Name,
			"description":       "",
			"aggregationMethod": "SUM",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		unchanged, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, unchanged.ResetPeriod)
	})

	t.Run("WhenChangingConfiguredAnchor_Returns400ImmutableResetAnchor", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toUpdate := createPeriodicEntitlement(t, "change-anchor", period.Month, period.Calendar)

		payload := map[string]any{
			"name":              toUpdate.Name,
			"description":       "",
			"aggregationMethod": "SUM",
			"resetPeriod":       "MONTH",
			"resetAnchor":       "LICENSE_START",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		unchanged, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, unchanged.ResetAnchor)
		require.Equal(t, period.Calendar, *unchanged.ResetAnchor)
	})
}
