package huma

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	humalib "github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humafiber"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/fiberapi"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// A scope refusal is decided in the facade now, not in a middleware, so what needs
// pinning is the translation: an error returned *out of* a handler must reach the
// client as the same status, code and problem+json body the middleware produced
// when it answered *before* the handler ran. Nothing in the handler formats a
// response -- that is the point. It returns caller.Require's error, and the
// transport turns it into HTTP.

const testRequiredScope = "read:licenses"

// gatedFacade is the shape of every facade method, reduced to the only line these
// tests are about. The real ones call Require and then a use case; here the use
// case would never be reached, which is the case under test.
//
// It records that it was reached, because "was the facade reached" is the question
// both tests turn on: reached for an under-scoped caller means nothing refused the
// request in front of the one enforcement point, and not reached for an
// unauthenticated one means the transport still answers that before any application
// code observes the request.
func gatedFacade(reached *bool, cl caller.OrganizationCaller) error {
	*reached = true
	return cl.Require(testRequiredScope)
}

func TestForbiddenFromTheFacadeIs403OnBothRouters(t *testing.T) {
	SetErrorHandler()

	underScoped := &principal.Principal{
		Kind:           principal.KindOrganization,
		UserID:         uuid.New(),
		OrganizationID: uuid.New(),
		Scopes:         []string{scope.Read(scope.Customers)},
	}

	for name, do := range gatedRouters() {
		t.Run(name, func(t *testing.T) {
			reached, status, body := do(t, underScoped)

			assert.True(t, reached,
				"an under-scoped caller must reach the facade: nothing sits in front of the "+
					"one enforcement point, and if something did, this test would pass while "+
					"proving the wrong thing")
			assert.Equal(t, http.StatusForbidden, status)
			assert.Equal(t, scope.ErrCodeMissingScope, body.Code)
			assert.Equal(t, http.StatusForbidden, body.Status)
			assert.Contains(t, body.Detail, testRequiredScope,
				"a caller is told which scope it lacks, as it was before")
			assert.Equal(t, "/gated", body.Instance, "both routers report the occurrence the same way")
			assert.Empty(t, body.ErrorID, "the message is deliberate, nothing was withheld")
		})
	}
}

// A missing identity is still answered 401, and still before any facade method
// observes the request. Both routers now decide it the same way -- caller.Organization
// refuses to construct -- which is what collapsed the two mechanisms this test was
// written to keep in agreement into one. The assertion stays because the answer is
// what matters to a client: 401, so it refreshes its token instead of concluding it
// lacks permission.
func TestMissingIdentityIs401OnBothRouters(t *testing.T) {
	SetErrorHandler()

	for name, do := range gatedRouters() {
		t.Run(name, func(t *testing.T) {
			reached, status, body := do(t, nil)

			assert.False(t, reached,
				"an unauthenticated request is refused before the facade, so no facade "+
					"method and no use case observes it")
			assert.Equal(t, http.StatusUnauthorized, status,
				"no identity is an authentication failure, not an authorization one")
			assert.Equal(t, scope.ErrCodeNoIdentity, body.Code)
			assert.Equal(t, http.StatusUnauthorized, body.Status)
			assert.NotEmpty(t, body.Title)
			assert.Equal(t, "/gated", body.Instance)
		})
	}
}

// gatedRouter answers a request carrying p, reporting whether the facade was
// reached.
type gatedRouter func(t *testing.T, p *principal.Principal) (bool, int, *kaitenerrors.Problem)

func gatedRouters() map[string]gatedRouter {
	return map[string]gatedRouter{"huma": callHumaRoute, "fiber": callFiberRoute}
}

func callHumaRoute(t *testing.T, p *principal.Principal) (bool, int, *kaitenerrors.Problem) {
	t.Helper()

	var reached bool

	// ConfigureErrors, because the server installs it on both huma configs and
	// because a *returned* error needs it where a middleware's did not: huma
	// serializes an apierrors.Error directly, so the RFC 9457 `instance` member is
	// filled by the transformer rather than by the error factory huma.WriteErr goes
	// through. That difference is a consequence of moving the refusal into the
	// handler, so the test that pins the refusal has to construct the API the way
	// the server does.
	app := newAppWithPrincipal(p)
	api := humafiber.New(app, ConfigureErrors(humalib.DefaultConfig("test", "1.0.0")))
	RegisterScoped(api, humalib.Operation{
		OperationID: "gated",
		Method:      http.MethodGet,
		Path:        "/gated",
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden},
	}, testRequiredScope, func(ctx context.Context, _ *struct{}) (*struct{}, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if err := gatedFacade(&reached, cl); err != nil {
			return nil, err
		}

		return &struct{}{}, nil
	})

	status, body := doRequest(t, app, "/gated")

	return reached, status, body
}

func callFiberRoute(t *testing.T, p *principal.Principal) (bool, int, *kaitenerrors.Problem) {
	t.Helper()

	var reached bool

	app := newAppWithPrincipal(p)
	app.Get("/gated", func(c fiber.Ctx) error {
		cl, err := caller.Organization(c.Context())
		if err != nil {
			return fiberapi.Problem(c, err)
		}
		if err := gatedFacade(&reached, cl); err != nil {
			return fiberapi.Problem(c, err)
		}

		return c.SendStatus(http.StatusNoContent)
	})

	status, body := doRequest(t, app, "/gated")

	return reached, status, body
}

func newAppWithPrincipal(p *principal.Principal) *fiber.App {
	app := fiber.New()
	if p != nil {
		app.Use(func(c fiber.Ctx) error {
			c.SetContext(principal.ContextWithPrincipal(c.Context(), p))
			return c.Next()
		})
	}
	return app
}

func doRequest(t *testing.T, app *fiber.App, path string) (int, *kaitenerrors.Problem) {
	t.Helper()

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	assert.Contains(t, resp.Header.Get("Content-Type"), "application/problem+json",
		"RFC 9457 bodies must be served as problem+json")

	var body kaitenerrors.Problem
	require.NoError(t, json.Unmarshal(raw, &body), "body was %s", raw)
	return resp.StatusCode, &body
}
