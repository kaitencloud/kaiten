package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gofiber/fiber/v3"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// This file is the two-listener boundary as tests. Everything here reads the REAL
// router, built by the same New the runtime calls, because the property being
// asserted is about wiring: which routes exist on which app, and which middleware
// each app runs. A test that restated the route table would go stale the first
// time somebody registers an operation on the wrong huma API -- which is the
// mistake the split exists to make impossible.
//
// Every Test call below passes an explicit fiber.TestConfig{} to drop Fiber's
// default one-second budget per request, because none of these assertions is
// about latency. GET /api/openapi.json renders the entire document, which already
// costs a couple of hundred milliseconds under -race and grows with every
// operation the API gains, so on a loaded CI runner it outruns that default and
// reports "i/o timeout" -- a failure that reads as a broken boundary and is
// nothing of the sort. A handler that genuinely hangs is still caught, by the test
// binary's own timeout, whose goroutine dump says considerably more than a
// deadline error would.

// routesOf returns every method+path registered on one Fiber app, HEAD/OPTIONS
// excluded: Fiber adds those itself for every GET and they carry no handler of
// ours.
func routesOf(t *testing.T, app *fiber.App) []string {
	t.Helper()

	var routes []string
	for _, route := range app.GetRoutes(true) {
		if route.Method == fiber.MethodHead || route.Method == fiber.MethodOptions {
			continue
		}
		routes = append(routes, route.Method+" "+route.Path)
	}
	return routes
}

// TestNoPlatformRouteIsRegisteredOnTheCoreListener is the property the split
// exists for, stated over the whole route table rather than over a sample.
//
// It is deliberately not "GET /api/platform/me answers 404" -- that is the next
// test. This one is stronger: not one route under the Platform namespace exists on
// the public app, so there is nothing for a future middleware, redirect or
// prefix-match to reach.
func TestNoPlatformRouteIsRegisteredOnTheCoreListener(t *testing.T) {
	t.Parallel()

	s := newTestServer(t)

	for _, route := range routesOf(t, s.Router()) {
		_, path, _ := strings.Cut(route, " ")
		if IsPlatformAPIPath(path) {
			t.Errorf("%s is registered on the public listener; the Platform API is internal-only", route)
		}
	}
}

// TestPlatformRoutesAreRegisteredOnThePlatformListener is the other half, and it
// is what stops the test above from passing on a server that registers no platform
// routes at all.
func TestPlatformRoutesAreRegisteredOnThePlatformListener(t *testing.T) {
	t.Parallel()

	s := newTestServer(t)

	var platformRoutes []string
	for _, route := range routesOf(t, s.PlatformRouter()) {
		_, path, _ := strings.Cut(route, " ")
		if IsPlatformAPIPath(path) {
			platformRoutes = append(platformRoutes, route)
		}
	}

	if len(platformRoutes) == 0 {
		t.Fatalf("no /api/platform route is registered on the Platform listener; routes: %#v",
			routesOf(t, s.PlatformRouter()))
	}

	// The introspection endpoint by name: it is the one operation every platform
	// caller can reach, so its absence would be the first thing anyone noticed.
	if !slices.Contains(platformRoutes, http.MethodGet+" /api/platform/me") {
		t.Errorf("GET /api/platform/me is missing from the Platform listener; got %#v", platformRoutes)
	}
}

// TestAPlatformPathIsAnUnknownRouteOnTheCoreListener pins the OBSERVABLE form of
// the boundary, and specifically that it is a routing answer rather than an
// authorization one.
//
// 404 is the point. A 401 or a 403 would mean the public listener still has a
// notion of the Platform API -- something matched the path and decided the caller
// could not have it. Nothing matches: as far as the public app is concerned that
// path is no different from /api/nonsense.
func TestAPlatformPathIsAnUnknownRouteOnTheCoreListener(t *testing.T) {
	t.Parallel()

	s := newTestServer(t)

	for _, path := range []string{
		"/api/platform/me",
		"/api/platform/organizations/00000000-0000-0000-0000-000000000000",
		"/api/platform/users/00000000-0000-0000-0000-000000000000",
		"/api/platform-openapi.json",
	} {
		t.Run(path, func(t *testing.T) {
			resp, err := s.Router().Test(httptest.NewRequest(http.MethodGet, path, nil), fiber.TestConfig{})
			if err != nil {
				t.Fatalf("GET %s error = %v", path, err)
			}
			defer func() {
				if err := resp.Body.Close(); err != nil {
					t.Errorf("closing the response body: %v", err)
				}
			}()

			if resp.StatusCode != http.StatusNotFound {
				t.Errorf("GET %s on the public listener = %d, want %d: the Platform surface must be "+
					"unknown here, not merely refused", path, resp.StatusCode, http.StatusNotFound)
			}
		})
	}
}

// recordingMiddleware is an auth.Middleware that counts how many requests reached
// it and attaches a principal. It is how "the platform authenticator runs on one
// listener" is asserted directly rather than inferred from a status code.
type recordingMiddleware struct {
	calls     atomic.Int64
	principal *principal.Principal
}

func (m *recordingMiddleware) Authorization() fiber.Handler {
	return func(c fiber.Ctx) error {
		m.calls.Add(1)
		if m.principal != nil {
			c.SetContext(principal.ContextWithPrincipal(c.Context(), m.principal))
		}
		return c.Next()
	}
}

// TestPlatformAuthenticationRunsOnlyOnThePlatformListener is requirement 5 of the
// split, asserted at the wiring layer: no request to the public app can reach the
// middleware that verifies a platform token, because that middleware is not
// mounted there.
//
// The Core authenticator is left nil here on purpose. What is under test is not
// what Core auth *decides* about a platform token -- internal/platform/auth proves
// it cannot authenticate one, on the same token the Platform middleware accepts --
// but that the Platform authenticator is never given the chance to decide
// anything on the public port.
func TestPlatformAuthenticationRunsOnlyOnThePlatformListener(t *testing.T) {
	t.Parallel()

	platformAuth := &recordingMiddleware{principal: &principal.Principal{
		Kind:            principal.KindPlatform,
		UserID:          platformidentity.ID,
		PlatformTokenID: platformidentity.ID,
		Scopes:          scope.AllScopes(),
	}}

	s, err := New(context.Background(), Dependencies{PlatformAuth: platformAuth}, config.Config{})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	// Every shape of request the public listener serves, including the platform
	// paths it deliberately does not.
	for _, path := range []string{
		"/api/platform/me",
		"/api/customers",
		"/api/openapi.json",
		"/api/docs",
		"/api/healthz",
		"/api/nonsense",
	} {
		resp, err := s.Router().Test(httptest.NewRequest(http.MethodGet, path, nil), fiber.TestConfig{})
		if err != nil {
			t.Fatalf("GET %s error = %v", path, err)
		}
		if err := resp.Body.Close(); err != nil {
			t.Errorf("closing the response body: %v", err)
		}
	}

	if got := platformAuth.calls.Load(); got != 0 {
		t.Fatalf("the platform authenticator ran %d times on the public listener; it must never run there", got)
	}

	resp, err := s.PlatformRouter().Test(httptest.NewRequest(http.MethodGet, "/api/platform/me", nil), fiber.TestConfig{})
	if err != nil {
		t.Fatalf("GET /api/platform/me on the Platform listener error = %v", err)
	}
	if err := resp.Body.Close(); err != nil {
		t.Errorf("closing the response body: %v", err)
	}

	if got := platformAuth.calls.Load(); got != 1 {
		t.Fatalf("the platform authenticator ran %d times for one Platform API request, want 1", got)
	}
}

// TestThePlatformListenerAuthenticatesEveryOperation is the negative half of the
// public-path allowlist: the document is readable, the operations are not, and
// removing the authenticator does not quietly open them.
func TestThePlatformListenerAuthenticatesEveryOperation(t *testing.T) {
	t.Parallel()

	platformAuth := &recordingMiddleware{}

	s, err := New(context.Background(), Dependencies{PlatformAuth: platformAuth}, config.Config{})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	for _, route := range routesOf(t, s.PlatformRouter()) {
		method, path, _ := strings.Cut(route, " ")
		if IsPublicPlatformAPIPath(path) {
			continue
		}

		before := platformAuth.calls.Load()

		resp, err := s.PlatformRouter().Test(httptest.NewRequest(method, concretePathParams(path), nil), fiber.TestConfig{})
		if err != nil {
			t.Fatalf("%s error = %v", route, err)
		}
		if err := resp.Body.Close(); err != nil {
			t.Errorf("closing the response body: %v", err)
		}

		if platformAuth.calls.Load() == before {
			t.Errorf("%s answered without the platform authenticator running", route)
		}
	}
}

// TestCoreSurfacesStayOnTheCoreListener is the compatibility half. Nothing about
// the public API moved, and the routes that have no business on an internal port
// are not there.
func TestCoreSurfacesStayOnTheCoreListener(t *testing.T) {
	t.Parallel()

	s := newTestServer(t)
	core := routesOf(t, s.Router())
	platform := routesOf(t, s.PlatformRouter())

	for _, route := range []string{
		http.MethodGet + " /api/healthz",
		http.MethodGet + " /api/readyz",
		http.MethodGet + " /api/customers",
		http.MethodPost + " /api/graphql",
		http.MethodGet + " /api/openapi.json",
	} {
		if !slices.Contains(core, route) {
			t.Errorf("%s is missing from the public listener; got %#v", route, core)
		}
		if slices.Contains(platform, route) {
			t.Errorf("%s is registered on the internal listener, which serves the Platform API only", route)
		}
	}

	// The ext_authz check answers on the public port because that is where the
	// gateway calling it lives. It answers any method, so it is looked up by path.
	if !containsPath(core, "/api/tokens/validate") {
		t.Errorf("the token-validation route is missing from the public listener; got %#v", core)
	}
	if containsPath(platform, "/api/tokens/validate") {
		t.Error("the token-validation route is registered on the internal listener")
	}

	// Dapr subscriber routes likewise: the sidecar delivers to the app port.
	if !containsPrefix(core, "/dapr") {
		t.Errorf("no /dapr route on the public listener; got %#v", core)
	}
	if containsPrefix(platform, "/dapr") {
		t.Error("a /dapr route is registered on the internal listener")
	}
}

func containsPath(routes []string, want string) bool {
	for _, route := range routes {
		if _, path, _ := strings.Cut(route, " "); path == want {
			return true
		}
	}
	return false
}

func containsPrefix(routes []string, prefix string) bool {
	for _, route := range routes {
		if _, path, _ := strings.Cut(route, " "); strings.HasPrefix(path, prefix) {
			return true
		}
	}
	return false
}

// concretePathParams substitutes a value for every :param so a request matches the
// route it was derived from. The value never has to exist: what is being observed
// is whether the authenticator ran, which happens long before any handler.
func concretePathParams(path string) string {
	segments := strings.Split(path, "/")
	for i, segment := range segments {
		if strings.HasPrefix(segment, ":") || strings.HasPrefix(segment, "*") {
			segments[i] = "00000000-0000-0000-0000-000000000000"
		}
	}
	return strings.Join(segments, "/")
}
