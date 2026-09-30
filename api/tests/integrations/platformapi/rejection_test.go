package platformapi_test

import (
	"net/http"
	"sort"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/server"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// coreAPIEndpoints is a representative sample of the Core API, not an
// enumeration of it: one huma operation per shape that could plausibly behave
// differently -- a collection read, a single-resource read, a write, a delete,
// and a raw Fiber route that has no huma operation middleware at all.
//
// Enumerating every operation would be a worse test, because it would pass by
// coincidence for any operation that happens to 404 first. These are asserted
// against the shared boundary, and the architecture test is what proves the
// boundary covers the operations this list omits.
var coreAPIEndpoints = []struct {
	name   string
	method string
	path   string
	body   any
}{
	{name: "collection read", method: http.MethodGet, path: "/api/service-accounts", body: nil},
	{name: "another module's collection read", method: http.MethodGet, path: "/api/customers", body: nil},
	{name: "read of one resource", method: http.MethodGet, path: "/api/releases", body: nil},
	// A VALID body, and it has to be one. The class is settled on the handler's
	// first line, which is behind huma's request binding -- send nothing and the
	// 400 for the empty body arrives first, proving only that huma validates
	// bodies. A request that is wrong in exactly one way, the credential's class,
	// is the only one whose refusal says anything about the class.
	{
		name: "write", method: http.MethodPost, path: "/api/customers",
		body: map[string]any{"name": "Awesome customer"},
	},
	{
		// The one route whose refusal comes from neither a huma operation nor a
		// facade method: graphqlHandler resolves a caller.Organization of its own and
		// hands it to its scope gate, because the resolver tree behind it takes none.
		// It is in this sample for exactly that reason -- it is the shape that used to
		// need a default-deny middleware over the whole /api group.
		name: "graphql (raw fiber route, resolves a caller for its scope gate)", method: http.MethodPost,
		path: "/api/graphql", body: map[string]any{"query": "{ __typename }"},
	},
}

// TestPlatformRoutesAreOnlyOnThePlatformListener is the first thing the split
// has to be true of, and it is asserted by walking BOTH routers rather than by
// naming paths: every Platform API route the internal listener serves must be a
// plain 404 on the public one.
//
// The 404 is the assertion, not the mere absence of a route. A platform path that
// answered 401 or 403 on the public listener would mean something there still
// matched it -- a redirect, a prefix mount, a middleware that recognised the
// namespace -- and "recognised but refused" is one configuration change away from
// "recognised and allowed". Nothing recognises it.
func TestPlatformRoutesAreOnlyOnThePlatformListener(t *testing.T) {
	routes := platformRoutesUnderTest(t, platformServer.PlatformApp)
	require.NotEmpty(t, routes, "no Platform routes were discovered; the walk is broken, not the boundary")

	for _, route := range routes {
		t.Run(route, func(t *testing.T) {
			method, path, _ := strings.Cut(route, " ")
			request := commonfixture.NewJSONRequest(t, method, concreteParams(path), nil)

			// The public listener, addressed with the credential the Platform API
			// itself accepts: even that must find nothing here.
			response, err := platformServer.App.Test(request, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, response.Body)

			require.Equal(t, http.StatusNotFound, response.StatusCode,
				"%s is reachable on the public listener", route)
		})
	}
}

// platformRoutesUnderTest walks the internal listener and returns every route
// inside the Platform API's namespace, for the same reason coreRoutesUnderTest
// walks the public one: a list would go stale the first time somebody adds an
// operation and does not think of this file.
func platformRoutesUnderTest(t *testing.T, app *fiber.App) []string {
	t.Helper()

	seen := make(map[string]bool)
	var routes []string

	for _, route := range app.GetRoutes(true) {
		if route.Method == fiber.MethodHead || route.Method == fiber.MethodOptions {
			continue
		}
		if !server.IsPlatformAPIPath(route.Path) {
			continue
		}

		key := route.Method + " " + route.Path
		if seen[key] {
			continue
		}
		seen[key] = true
		routes = append(routes, key)
	}

	sort.Strings(routes)
	return routes
}

// TestPlatformCredentialIsRejectedByTheCoreAPI is the critical negative test.
//
// The platform principal here carries scope.AllScopes(), so nothing is being
// stopped by a missing scope: the only reason each of these requests fails is the
// credential's class. That is the property -- a credential that authenticates the
// platform can hold every scope in the system and still not act inside a tenant.
//
// Since the split, no production credential can put a platform principal into the
// public listener's pipeline at all: that listener's authenticator has no path to
// one. This suite's stub is what keeps the floor underneath it testable, and the
// floor is what still answers if some future middleware finds another way to set a
// principal.
func TestPlatformCredentialIsRejectedByTheCoreAPI(t *testing.T) {
	for _, endpoint := range coreAPIEndpoints {
		t.Run(endpoint.name, func(t *testing.T) {
			request := commonfixture.NewJSONRequest(t, endpoint.method, endpoint.path, endpoint.body)

			response, err := platformServer.App.Test(request, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, response.Body)

			require.Equal(t, http.StatusForbidden, response.StatusCode,
				"%s %s accepted a platform credential", endpoint.method, endpoint.path)
		})
	}
}

// TestEveryCoreRouteRejectsAPlatformCredential is the sampled test above made
// total: it walks the ACTUAL router and asserts every Core route refuses a platform
// credential, so the claim is checkable rather than argued.
func TestEveryCoreRouteRejectsAPlatformCredential(t *testing.T) {
	routes := coreRoutesUnderTest(t, platformServer.App)
	require.NotEmpty(t, routes, "no Core routes were discovered; the walk is broken, not the boundary")

	// The sampled list above must be a subset of what the walk covers, or the two
	// tests are describing different servers.
	require.Contains(t, routes, "POST /api/graphql",
		"the raw GraphQL route is the reason this test exists and the walk missed it")

	for _, route := range routes {
		t.Run(route, func(t *testing.T) {
			method, path, _ := strings.Cut(route, " ")

			request := commonfixture.NewJSONRequest(t, method, concreteParams(path), nil)
			response, err := platformServer.App.Test(request, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, response.Body)

			require.GreaterOrEqual(t, response.StatusCode, http.StatusBadRequest,
				"%s served a platform credential", route)

			if response.StatusCode != http.StatusForbidden {
				// Refused before the handler, by huma's binding or validation. Which
				// status that is belongs to the route's own contract, not to this
				// test -- all this one is owed is that nothing was served.
				return
			}

			body := commonfixture.AssertJSONResponse[map[string]any](t, response, http.StatusForbidden)
			require.Equal(t, principal.ErrCodeWrongCredentialKind, body["code"],
				"%s refused a platform credential for some other reason", route)
		})
	}
}

// probeOnlyPaths are the two routes kubelet calls, registered on the root router
// rather than on the /api group, so no auth middleware and no credential-class
// floor runs for them at all. They carry no tenant data and answer for a process,
// not for a caller.
//
// Everything else that answers without a credential is server.IsPublicAPIPath's
// business, and this test asks that function rather than restating it -- a
// restatement is what disagrees, which is how the OpenAPI documents' -3.0.json and
// -3.0.yaml downgrades were missed the first time this test ran.
var probeOnlyPaths = map[string]bool{"/api/healthz": true, "/api/readyz": true}

// documentationPaths are routes huma registers itself to publish the contract,
// which answer the same constant bytes to every caller and read no request state at
// all.
//
// One entry, and it is here rather than in server.IsPublicAPIPath because it is not
// public: /api/schemas/{schema} sits inside the auth pipeline and a caller still
// needs a credential to fetch it. What it does not do is care WHICH credential,
// having no handler of ours to resolve one -- so once the pre-parse floor went, it
// answered a platform principal exactly as it answers an organization one.
//
// Excluded rather than fixed because there is nothing here to fix. It serves the
// component schemas, the same ones already inlined in /api/openapi.yaml, which
// IsPublicAPIPath hands to callers with no credential whatsoever. A route cannot
// leak to an authenticated platform credential what it already publishes
// anonymously.
var documentationPaths = map[string]bool{"/api/schemas/:schema": true}

// coreRoutesUnderTest walks the public Fiber router and returns every route a
// platform credential must be refused on: everything under /api that is not
// public. The Platform-namespace filter is kept even though that listener no
// longer registers one -- it is what makes this walk's contract explicit, and it
// costs nothing to state that those routes are somebody else's question.
//
// Reading the router rather than a list is the point. A list would be a second
// enumeration of the server that goes stale the first time somebody adds a route
// and does not think of this file -- which is exactly the case the boundary has to
// survive.
func coreRoutesUnderTest(t *testing.T, app *fiber.App) []string {
	t.Helper()

	seen := make(map[string]bool)
	var routes []string

	for _, route := range app.GetRoutes(true) {
		if route.Method == fiber.MethodHead || route.Method == fiber.MethodOptions {
			// Fiber registers these itself for every GET; they carry no handler of
			// ours and no data.
			continue
		}
		if !strings.HasPrefix(route.Path, "/api") {
			continue
		}
		if server.IsPlatformAPIPath(route.Path) {
			continue
		}
		if server.IsPublicAPIPath(route.Path) || probeOnlyPaths[route.Path] || documentationPaths[route.Path] {
			continue
		}

		key := route.Method + " " + route.Path
		if seen[key] {
			continue
		}
		seen[key] = true
		routes = append(routes, key)
	}

	sort.Strings(routes)
	return routes
}

// concreteParams substitutes a fresh uuid for every :param so the request matches
// the route it was derived from. The value never has to exist: the credential class
// is settled on the handler's first line, before any id is looked up, so a request
// that got as far as looking one up would already have failed this test.
func concreteParams(path string) string {
	segments := strings.Split(path, "/")
	for i, segment := range segments {
		if strings.HasPrefix(segment, ":") || strings.HasPrefix(segment, "*") {
			segments[i] = uuid.NewString()
		}
	}
	return strings.Join(segments, "/")
}

// TestOrganizationCredentialIsRejectedByThePlatformAPI is the same assertion in
// the other direction, and it matters just as much: a surface that only rejects
// one way is not a partition.
func TestOrganizationCredentialIsRejectedByThePlatformAPI(t *testing.T) {
	request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/platform/me", nil)

	response, err := organizationServer.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	require.Equal(t, http.StatusForbidden, response.StatusCode,
		"the Platform API accepted an organization credential")
}

// TestBothRejectionsShareOneErrorCode keeps neither surface from becoming an
// oracle about the other. A caller that holds the wrong class of credential
// learns that it holds the wrong class -- not which class the operation wanted,
// and not whether the operation exists.
func TestBothRejectionsShareOneErrorCode(t *testing.T) {
	platformOnCore := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/service-accounts", nil)
	organizationOnPlatform := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/platform/me", nil)

	first, err := platformServer.App.Test(platformOnCore, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, first.Body)

	second, err := organizationServer.PlatformApp.Test(organizationOnPlatform, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, second.Body)

	firstBody := commonfixture.AssertJSONResponse[map[string]any](t, first, http.StatusForbidden)
	secondBody := commonfixture.AssertJSONResponse[map[string]any](t, second, http.StatusForbidden)

	// "code", not "type": type is the RFC 9457 documentation URI, which is the
	// same generic status link for every 403, so comparing it would pass no matter
	// what the two surfaces actually said. code is the machine-readable one
	// (apierrors.Problem.Code) and is what a client branches on.
	require.NotEmpty(t, firstBody["code"], "the rejection carries no machine-readable code")
	require.Equal(t, firstBody["code"], secondBody["code"],
		"the two rejection directions report different error codes")
	require.Equal(t, firstBody["detail"], secondBody["detail"],
		"the two rejection directions report different messages")
}

// TestPlatformCredentialCannotResolveAnOrganizationUser pins the choke point that
// covers the ~88 GetUser callers and the ~570 .OrganizationID references none of
// which check for uuid.Nil: a platform principal cannot obtain a
// currentuser.User at all, so no organization-scoped handler can run against a
// nil organization.
//
// Asserted through an endpoint whose handler does nothing but call GetUser first,
// which is why the response is a 403 and not an empty list.
func TestPlatformCredentialCannotResolveAnOrganizationUser(t *testing.T) {
	request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/service-accounts", nil)

	response, err := platformServer.App.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	body := commonfixture.AssertJSONResponse[map[string]any](t, response, http.StatusForbidden)
	require.NotContains(t, body, "data",
		"a platform credential received organization data")
}
