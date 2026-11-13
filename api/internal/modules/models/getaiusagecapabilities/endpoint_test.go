package getaiusagecapabilities_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humafiber"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/getaiusagecapabilities"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
)

func TestCapabilitiesAreAuthenticatedReadinessWithoutProductScopes(t *testing.T) {
	t.Parallel()
	for _, enabled := range []bool{false, true} {
		cfg := config.CoreConfig{}
		app, err := kaiten.New(kaiten.Options{Config: cfg, PlatformFlags: aitest.Flags(enabled)})
		require.NoError(t, err)
		t.Cleanup(app.Close)
		for _, scopes := range [][]string{{}, {"read:models"}, {"read:instances"}} {
			httpApp := fiber.New(fiber.Config{ErrorHandler: fiberapi.SetErrorHandler()})
			httpApp.Use(func(c fiber.Ctx) error {
				c.SetContext(principal.ContextWithPrincipal(c.Context(), &principal.Principal{Kind: principal.KindOrganization, UserID: uuid.New(), OrganizationID: uuid.New(), Scopes: scopes}))
				return c.Next()
			})
			api := humafiber.New(httpApp, kaitenhuma.ConfigureErrors(kaitenhuma.ConfigureSecurity(huma.DefaultConfig("test", "1"))))
			getaiusagecapabilities.RegisterEndpoint(api, app.Models())
			resp, err := httpApp.Test(httptest.NewRequest(http.MethodGet, "/ai/capabilities", nil))
			require.NoError(t, err)
			require.Equal(t, http.StatusOK, resp.StatusCode)
			require.Equal(t, "no-store", resp.Header.Get("Cache-Control"))
			var body map[string]any
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
			require.NoError(t, resp.Body.Close())
			require.Equal(t, enabled, body["enabled"])
			delete(body, "$schema") // Huma may attach a schema link; no config/grants are returned.
			require.Len(t, body, 1)
			op := api.OpenAPI().Paths["/ai/capabilities"].Get
			require.Equal(t, "getAiUsageCapabilities", op.OperationID)
			require.Equal(t, []map[string][]string{{kaitenhuma.BearerAuth: {}}}, op.Security)
		}
		_, err = app.Models().Capabilities(t.Context(), caller.OrganizationCaller{})
		require.Error(t, err, "a zero caller must not reach an auth-only facade")
	}
}

func TestCapabilitiesRejectNonOrganizationCredentials(t *testing.T) {
	t.Parallel()
	app, err := kaiten.New(kaiten.Options{})
	require.NoError(t, err)
	for _, kind := range []principal.Kind{principal.KindUnset, principal.KindPlatform, principal.KindSystem, principal.KindPublishableKey, principal.KindCustomerSession} {
		httpApp := fiber.New(fiber.Config{ErrorHandler: fiberapi.SetErrorHandler()})
		httpApp.Use(func(c fiber.Ctx) error {
			c.SetContext(principal.ContextWithPrincipal(c.Context(), &principal.Principal{Kind: kind, UserID: uuid.New(), OrganizationID: uuid.New()}))
			return c.Next()
		})
		getaiusagecapabilities.RegisterEndpoint(humafiber.New(httpApp, kaitenhuma.ConfigureErrors(huma.DefaultConfig("test", "1"))), app.Models())
		resp, err := httpApp.Test(httptest.NewRequest(http.MethodGet, "/ai/capabilities", nil))
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, resp.StatusCode)
		require.NoError(t, resp.Body.Close())
	}
}
