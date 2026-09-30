package server

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"

	"github.com/kaitencloud/kaiten/api/config"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()

	s, err := New(context.Background(), Dependencies{}, config.Config{})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	return s
}

// routePaths counts the routes registered on one Fiber app. It takes the app
// rather than the Server because there are two of them now, and every question in
// this file is about which one a route landed on.
func routePaths(t *testing.T, app *fiber.App) map[string]int {
	t.Helper()

	counts := map[string]int{}
	for _, routes := range app.Stack() {
		for _, route := range routes {
			// Keyed by method too: the same path served by GET and POST is two
			// routes, not a collision.
			counts[route.Method+" "+route.Path]++
		}
	}
	return counts
}

// Each OpenAPI document is served by the listener that serves the operations it
// describes, so a reader who can reach a document can reach the API it
// documents.
func TestEachDocumentIsServedByItsOwnListener(t *testing.T) {
	t.Parallel()

	s := newTestServer(t)
	core := routePaths(t, s.Router())
	platform := routePaths(t, s.PlatformRouter())

	const coreDocument = http.MethodGet + " /api/openapi.json"
	const platformDocument = http.MethodGet + " /api/platform-openapi.json"

	if core[coreDocument] == 0 {
		t.Errorf("expected %q on the Core listener, got routes: %#v", coreDocument, core)
	}
	if platform[platformDocument] == 0 {
		t.Errorf("expected %q on the Platform listener, got routes: %#v", platformDocument, platform)
	}

	if core[platformDocument] != 0 {
		t.Errorf("%q is served by the public listener; the Platform document moved with its API", platformDocument)
	}
	if platform[coreDocument] != 0 {
		t.Errorf("%q is served by the internal listener; the Core document belongs to the public one", coreDocument)
	}
}

// TestCoreAndPlatformDocumentRoutesDoNotCollide keeps the two documents' paths
// distinct. The technical reason is gone -- they are on separate Fiber apps now,
// so huma could register both at /openapi without colliding -- but the paths are
// part of the published contract (app/platform-openapi.yaml, the SDK generation,
// every link), so this asserts they stay what callers already fetch.
func TestCoreAndPlatformDocumentRoutesDoNotCollide(t *testing.T) {
	t.Parallel()

	s := newTestServer(t)

	if s.apiConfig.SchemasPath == "" {
		t.Fatal("Core SchemasPath is empty; huma would register schema routes at the group root")
	}
	if s.apiConfig.SchemasPath == s.platformConfig.SchemasPath {
		t.Fatalf("Core and Platform share SchemasPath %q", s.apiConfig.SchemasPath)
	}
	if s.apiConfig.OpenAPIPath == s.platformConfig.OpenAPIPath {
		t.Fatalf("Core and Platform share OpenAPIPath %q", s.apiConfig.OpenAPIPath)
	}

	// And both routers agree: no method+path pair is registered twice on either.
	for name, app := range map[string]*fiber.App{"core": s.Router(), "platform": s.PlatformRouter()} {
		for key, count := range routePaths(t, app) {
			if count > 1 {
				t.Errorf("route %q is registered %d times on the %s listener", key, count, name)
			}
		}
	}
}

// TestPlatformDocsPageIsSuppressed pins the other half of that arrangement:
// huma's Scalar renderer takes a single spec URL and is skipped entirely when
// DocsPath is empty, so kaitenhuma.RegisterDocs is what serves the page on each
// listener -- neither config asks huma for one.
func TestPlatformDocsPageIsSuppressed(t *testing.T) {
	t.Parallel()

	s := newTestServer(t)

	if s.platformConfig.DocsPath != "" {
		t.Fatalf("expected the Platform document to register no docs page, got DocsPath %q",
			s.platformConfig.DocsPath)
	}
}

func TestPlatformOpenAPIServersUseAPIPrefix(t *testing.T) {
	t.Parallel()

	s := newTestServer(t)

	servers := s.PlatformAPI().OpenAPI().Servers
	if len(servers) == 0 {
		t.Fatal("expected at least one OpenAPI server on the Platform document")
	}
	if servers[0].URL != "/api" {
		t.Fatalf("expected the Platform server URL to be /api, got %q", servers[0].URL)
	}
}

// TestPlatformDocumentDeclaresOnlyPlatformSecurity is the contract-level
// statement of the Core/Platform partition: a client generated from this
// document cannot even express a bearerAuth credential, because the document
// never mentions the scheme.
func TestPlatformDocumentDeclaresOnlyPlatformSecurity(t *testing.T) {
	t.Parallel()

	s := newTestServer(t)
	oapi := s.PlatformAPI().OpenAPI()

	if oapi.Info.Title != "Kaiten Platform API" {
		t.Fatalf("expected the Platform document title, got %q", oapi.Info.Title)
	}

	if oapi.Components == nil || oapi.Components.SecuritySchemes == nil {
		t.Fatal("expected the Platform document to declare security schemes")
	}
	if _, ok := oapi.Components.SecuritySchemes[kaitenhuma.PlatformAuth]; !ok {
		t.Fatalf("expected the %q scheme on the Platform document", kaitenhuma.PlatformAuth)
	}
	if _, ok := oapi.Components.SecuritySchemes[kaitenhuma.BearerAuth]; ok {
		t.Fatalf("the Platform document declares %q; the two credential classes must not "+
			"appear on one document", kaitenhuma.BearerAuth)
	}

	if len(oapi.Security) != 1 {
		t.Fatalf("expected exactly one document-level security requirement, got %d", len(oapi.Security))
	}
	if _, ok := oapi.Security[0][kaitenhuma.PlatformAuth]; !ok {
		t.Fatalf("expected the document-level default to be %q, got %#v",
			kaitenhuma.PlatformAuth, oapi.Security[0])
	}
}

// TestOperationsAreDisjointBetweenTheTwoDocuments is the runtime twin of the
// architecture test's source-level partition assertion: whatever the source
// says, the two registered documents must not overlap.
func TestOperationsAreDisjointBetweenTheTwoDocuments(t *testing.T) {
	t.Parallel()

	s := newTestServer(t)
	core := s.API().OpenAPI()
	platform := s.PlatformAPI().OpenAPI()

	if len(platform.Paths) == 0 {
		t.Fatal("expected the Platform document to declare at least one operation")
	}

	for path := range platform.Paths {
		if !strings.HasPrefix(path, "/platform/") {
			t.Errorf("Platform document declares %q, which is outside the /platform/ namespace", path)
		}
		if _, ok := core.Paths[path]; ok {
			t.Errorf("path %q is declared on both documents", path)
		}
	}

	for path := range core.Paths {
		if strings.HasPrefix(path, "/platform/") {
			t.Errorf("Core document declares %q, which belongs to the Platform surface", path)
		}
	}
}

// TestPlatformMeIsPublished keeps the introspection endpoint from silently
// disappearing if module registration is reshuffled: it is the only operation
// that tells a credential holder what it holds.
func TestPlatformMeIsPublished(t *testing.T) {
	t.Parallel()

	s := newTestServer(t)

	item, ok := s.PlatformAPI().OpenAPI().Paths["/platform/me"]
	if !ok {
		t.Fatalf("expected /platform/me on the Platform document, got %#v",
			s.PlatformAPI().OpenAPI().Paths)
	}
	if item.Get == nil {
		t.Fatal("expected GET /platform/me")
	}

	requirements := item.Get.Security
	if len(requirements) == 0 {
		t.Fatal("expected GET /platform/me to declare a security requirement")
	}
	if !declaresScheme(requirements, kaitenhuma.PlatformAuth) {
		t.Fatalf("expected GET /platform/me to require %q, got %#v",
			kaitenhuma.PlatformAuth, requirements)
	}
}

func declaresScheme(requirements []map[string][]string, scheme string) bool {
	for _, requirement := range requirements {
		if _, ok := requirement[scheme]; ok {
			return true
		}
	}
	return false
}

// TestPlatformOperationPathsAreNotPublic pins the negative half of
// isPublicAPIPath: the Platform document may become world-readable, but every
// operation on it stays behind authentication.
func TestPlatformOperationPathsAreNotPublic(t *testing.T) {
	t.Parallel()

	paths := []string{
		"/api/platform/me",
		"/api/platform/organizations/00000000-0000-0000-0000-000000000000",
		"/api/platform/users/00000000-0000-0000-0000-000000000000",
	}

	for _, path := range paths {
		if IsPublicAPIPath(path) {
			t.Errorf("IsPublicAPIPath(%q) = true; Platform operations must be authenticated", path)
		}
	}
}
