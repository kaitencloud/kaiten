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
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// Credential class is decided by the caller each handler resolves, not by a
// middleware the registrar installs, so these tests drive the two registrars with
// handlers shaped like the production ones: caller.Organization or caller.Platform
// first, then the facade's scope check. What is pinned is the answer the SURFACE
// gives, which is the thing an integrator sees and the thing that had to survive the
// check moving out of the transport -- the same status, code and message, in both
// directions, for a wrong class and for no identity at all.

func organizationPrincipal() *principal.Principal {
	return &principal.Principal{
		Kind:           principal.KindOrganization,
		UserID:         uuid.New(),
		OrganizationID: uuid.New(),
		Scopes:         []string{testRequiredScope},
	}
}

func platformPrincipal() *principal.Principal {
	return &principal.Principal{
		Kind:            principal.KindPlatform,
		UserID:          uuid.New(),
		PlatformTokenID: uuid.New(),
		Scopes:          []string{testRequiredScope},
	}
}

func TestCredentialKind_MatchingKindPasses(t *testing.T) {
	SetErrorHandler()

	t.Run("organization credential on a Core operation", func(t *testing.T) {
		status, _ := callScopedRoute(t, organizationPrincipal())
		assert.Equal(t, http.StatusOK, status)
	})

	t.Run("platform credential on a Platform operation", func(t *testing.T) {
		status, _ := callPlatformRoute(t, platformPrincipal())
		assert.Equal(t, http.StatusOK, status)
	})
}

// The two directions must be indistinguishable. A distinct code or message per
// direction would turn each surface into an oracle for the other: a caller
// probing with one credential class would learn which operations the *other*
// class can reach, which is precisely the enumeration this partition denies.
func TestCredentialKind_BothDirectionsAreTheSame403(t *testing.T) {
	SetErrorHandler()

	platformOnCore, coreBody := callScopedRoute(t, platformPrincipal())
	organizationOnPlatform, platformBody := callPlatformRoute(t, organizationPrincipal())

	require.NotNil(t, coreBody)
	require.NotNil(t, platformBody)
	assert.Equal(t, http.StatusForbidden, platformOnCore)
	assert.Equal(t, http.StatusForbidden, organizationOnPlatform)
	assert.Equal(t, principal.ErrCodeWrongCredentialKind, coreBody.Code)
	assert.Equal(t, principal.ErrCodeWrongCredentialKind, platformBody.Code)
	assert.Equal(t, coreBody.Detail, platformBody.Detail,
		"neither surface may reveal which credential class the other would accept")
	assert.NotContains(t, coreBody.Detail, "platform",
		"the message must not name the class that would have worked")
}

// The kind check still runs before the scope check, and now it does so because of
// where each one sits on the call path rather than because of a middleware order: a
// caller of the wrong class never constructs, so there is nothing to call Require on.
// That is the stronger version of the property -- the ordering is a consequence of
// the types instead of a list a future registrar could append to differently.
func TestCredentialKind_PrecedesTheScopeCheck(t *testing.T) {
	SetErrorHandler()

	scopeless := platformPrincipal()
	scopeless.Scopes = nil

	status, body := callScopedRoute(t, scopeless)

	require.NotNil(t, body)
	assert.Equal(t, http.StatusForbidden, status)
	assert.Equal(t, principal.ErrCodeWrongCredentialKind, body.Code,
		"the wrong credential class is answered before scopes are considered")
	assert.NotContains(t, body.Detail, testRequiredScope)
}

// KindUnset is not a third credential class, it is the absence of one, so it
// satisfies neither surface. This is what makes naming KindOrganization safe: a
// construction site that forgets to assign a kind fails closed on both surfaces
// instead of silently being granted the Core API. It is also the runtime floor under
// the in-process caller, which binds exactly this kind -- see
// internal/kaiten/exec.go.
func TestCredentialKind_UnsetKindIsRefusedBySurfaces(t *testing.T) {
	SetErrorHandler()

	for name, do := range map[string]func(*testing.T, *principal.Principal) (int, *kaitenerrors.Problem){
		"RegisterScoped":   callScopedRoute,
		"RegisterPlatform": callPlatformRoute,
	} {
		t.Run(name, func(t *testing.T) {
			kindless := organizationPrincipal()
			kindless.Kind = principal.KindUnset

			status, body := do(t, kindless)

			require.NotNil(t, body)
			assert.Equal(t, http.StatusForbidden, status)
			assert.Equal(t, principal.ErrCodeWrongCredentialKind, body.Code)
		})
	}
}

// No identity at all is an authentication failure on both registrars -- the same
// distinction caller.Require makes for a scope, so a client refreshes its token
// instead of concluding it lacks permission.
func TestCredentialKind_MissingIdentityIs401(t *testing.T) {
	SetErrorHandler()

	for name, do := range map[string]func(*testing.T, *principal.Principal) (int, *kaitenerrors.Problem){
		"RegisterScoped":   callScopedRoute,
		"RegisterPlatform": callPlatformRoute,
	} {
		t.Run(name, func(t *testing.T) {
			status, body := do(t, nil)

			require.NotNil(t, body)
			assert.Equal(t, http.StatusUnauthorized, status)
			assert.Equal(t, scope.ErrCodeNoIdentity, body.Code)
		})
	}
}

// The Platform document must never mention the Core API's scheme: with no
// credential-class middleware left, the `security` entry IS the operation's
// declaration of its class, and it is what keeps a generated client from crossing
// the two.
func TestRegisterPlatformPublishesThePlatformScheme(t *testing.T) {
	SetErrorHandler()

	app := fiber.New()
	config := ConfigurePlatformSecurity(humalib.DefaultConfig("platform", "1.0.0"))
	api := humafiber.New(app, config)
	registerPlatformProbe(api)

	assert.Contains(t, config.Components.SecuritySchemes, PlatformAuth)
	assert.NotContains(t, config.Components.SecuritySchemes, BearerAuth)
	assert.Equal(t, []map[string][]string{{PlatformAuth: {}}}, config.Security)

	pathItem, ok := api.OpenAPI().Paths["/platform/probe"]
	require.True(t, ok)
	require.NotNil(t, pathItem.Get)
	require.Len(t, pathItem.Get.Security, 1)
	assert.Equal(t, []string{testRequiredScope}, pathItem.Get.Security[0][PlatformAuth])
	assert.NotContains(t, pathItem.Get.Security[0], BearerAuth)
}

func callScopedRoute(t *testing.T, p *principal.Principal) (int, *kaitenerrors.Problem) {
	t.Helper()

	app := newAppWithPrincipal(p)
	api := humafiber.New(app, ConfigureErrors(humalib.DefaultConfig("test", "1.0.0")))
	RegisterScoped(api, humalib.Operation{
		OperationID: "core-probe",
		Method:      http.MethodGet,
		Path:        "/probe",
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden},
	}, testRequiredScope, organizationProbeHandler)

	return doProbeRequest(t, app, "/probe")
}

func callPlatformRoute(t *testing.T, p *principal.Principal) (int, *kaitenerrors.Problem) {
	t.Helper()

	app := newAppWithPrincipal(p)
	api := humafiber.New(app,
		ConfigureErrors(ConfigurePlatformSecurity(humalib.DefaultConfig("test", "1.0.0"))))
	registerPlatformProbe(api)

	return doProbeRequest(t, app, "/platform/probe")
}

func registerPlatformProbe(api humalib.API) {
	RegisterPlatform(api, humalib.Operation{
		OperationID: "platform-probe",
		Method:      http.MethodGet,
		Path:        "/platform/probe",
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden},
	}, testRequiredScope, platformProbeHandler)
}

type probeOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

// organizationProbeHandler and platformProbeHandler are the shape every registered
// handler has: resolve a caller, then let the facade require the scope. gatedFacade
// stands in for the facade method, so the scope line these tests must not reach is a
// real one rather than an inlined comparison.
func organizationProbeHandler(ctx context.Context, _ *struct{}) (*probeOutput, error) {
	cl, err := caller.Organization(ctx)
	if err != nil {
		return nil, err
	}

	var reached bool
	if err := gatedFacade(&reached, cl); err != nil {
		return nil, err
	}

	out := &probeOutput{}
	out.Body.OK = true
	return out, nil
}

func platformProbeHandler(ctx context.Context, _ *struct{}) (*probeOutput, error) {
	cl, err := caller.Platform(ctx)
	if err != nil {
		return nil, err
	}
	if err := cl.Require(testRequiredScope); err != nil {
		return nil, err
	}

	out := &probeOutput{}
	out.Body.OK = true
	return out, nil
}

// probeHandler answers without reading the request at all. It exists for the
// registration-time tests, which assert a panic and never run the handler.
func probeHandler(context.Context, *struct{}) (*probeOutput, error) {
	out := &probeOutput{}
	out.Body.OK = true
	return out, nil
}

// doProbeRequest is doRequest's sibling for routes that can also succeed: it
// parses (and demands problem+json for) error responses only.
func doProbeRequest(t *testing.T, app *fiber.App, path string) (int, *kaitenerrors.Problem) {
	t.Helper()

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	if resp.StatusCode < http.StatusBadRequest {
		return resp.StatusCode, nil
	}

	assert.Contains(t, resp.Header.Get("Content-Type"), "application/problem+json",
		"RFC 9457 bodies must be served as problem+json")

	var body kaitenerrors.Problem
	require.NoError(t, json.Unmarshal(raw, &body), "body was %s", raw)
	return resp.StatusCode, &body
}
