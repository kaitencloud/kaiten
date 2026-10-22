package getauthorization

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humafiber"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/auth"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/externalid"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
)

type resolver struct {
	grants        atomic.Value
	deny          atomic.Bool
	userID, orgID uuid.UUID
}

func (r *resolver) Resolve(context.Context, uuid.UUID, uuid.UUID) ([]string, error) {
	if r.deny.Load() {
		return nil, kaitenerrors.Unauthorized("Auth.Revoked", "revoked")
	}
	return r.grants.Load().([]string), nil
}

type tokenResolver struct{ *resolver }

func (r tokenResolver) Resolve(context.Context, uuid.UUID, string, string) (uuid.UUID, uuid.UUID, []string, error) {
	grants, err := r.resolver.Resolve(context.Background(), r.orgID, r.userID)
	return r.userID, r.orgID, grants, err
}

func TestIntrospectionResolvesHumanAndMachineGrantsEveryRequest(t *testing.T) {
	t.Parallel()
	for _, machine := range []bool{false, true} {
		t.Run(map[bool]string{false: "human", true: "machine"}[machine], func(t *testing.T) {
			r := &resolver{userID: uuid.New(), orgID: externalid.DeriveOrganizationID("org_core")}
			r.grants.Store([]string{})
			app := fiber.New(fiber.Config{ErrorHandler: fiberapi.SetErrorHandler()})
			app.Use(func(c fiber.Ctx) error {
				p := &principal.Principal{
					Kind: principal.KindOrganization, UserID: r.userID, OrganizationID: r.orgID,
					Token: "synthetic-secret", Scopes: []string{"write:*"},
					Provisioning: principal.Provisioning{Subject: "user_core", ExternalOrganizationID: "org_core"},
				}
				if machine {
					p.OrganizationTokenID = uuid.New()
				}
				c.SetContext(principal.ContextWithPrincipal(c.Context(), p))
				return c.Next()
			})
			app.Use(auth.ResolveAuthorization(r, tokenResolver{r}))
			api := humafiber.New(app, kaitenhuma.ConfigureErrors(kaitenhuma.ConfigureSecurity(huma.DefaultConfig("test", "1"))))
			RegisterEndpoint(api)
			for _, grants := range [][]string{{}, {"write:webhooks"}, {}} {
				r.grants.Store(grants)
				resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/authorization", nil))
				require.NoError(t, err)
				require.Equal(t, 200, resp.StatusCode)
				assert.Equal(t, "no-store", resp.Header.Get("Cache-Control"))
				var body map[string]json.RawMessage
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
				_ = resp.Body.Close()
				var actual []string
				require.NoError(t, json.Unmarshal(body["scopes"], &actual))
				assert.Equal(t, grants, actual)
				assert.Len(t, body, 7, "explicit safe DTO only")
				for _, secret := range []string{"token", "organization_token_id", "platform_token_id", "provisioning"} {
					assert.NotContains(t, body, secret)
				}
			}
			r.deny.Store(true)
			resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/authorization", nil))
			require.NoError(t, err)
			assert.Equal(t, 401, resp.StatusCode)
			_ = resp.Body.Close()
		})
	}
}

func TestIntrospectionRejectsNonOrganizationOrIncompleteIdentity(t *testing.T) {
	t.Parallel()
	for _, kind := range []principal.Kind{principal.KindUnset, principal.KindPlatform, principal.KindSystem, principal.KindOrganization} {
		app := fiber.New(fiber.Config{ErrorHandler: fiberapi.SetErrorHandler()})
		app.Use(func(c fiber.Ctx) error {
			c.SetContext(principal.ContextWithPrincipal(c.Context(), &principal.Principal{Kind: kind}))
			return c.Next()
		})
		RegisterEndpoint(humafiber.New(app, kaitenhuma.ConfigureErrors(huma.DefaultConfig("test", "1"))))
		resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/authorization", nil))
		require.NoError(t, err)
		if kind == principal.KindOrganization {
			assert.Equal(t, 401, resp.StatusCode)
		} else {
			assert.Equal(t, 403, resp.StatusCode)
		}
		_ = resp.Body.Close()
	}
}
