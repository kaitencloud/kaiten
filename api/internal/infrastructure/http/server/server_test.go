package server

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/gofiber/fiber/v3"

	"github.com/kaitencloud/kaiten/api/config"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/auth"
)

func TestIsPublicAPIPath(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name     string
		path     string
		expected bool
	}{
		{name: "token validate", path: "/api/tokens/validate", expected: true},
		// The proxy rewrites every ext_authz check to the exact path above,
		// so nothing under that prefix may bypass auth (see
		// validatetoken.RegisterEndpoint).
		{name: "token validate suffix is not public", path: "/api/tokens/validate/mcp/some/tool", expected: false},
		{name: "token validate trailing slash is not public", path: "/api/tokens/validate/", expected: false},
		{name: "openapi", path: "/api/openapi", expected: true},
		{name: "docs root", path: "/api/docs", expected: true},
		{name: "docs asset", path: "/api/docs/swagger-ui.css", expected: true},
		// The Platform API's document is not public on this listener because this
		// listener does not serve it at all -- it is on the internal port with the
		// operations it describes. IsPublicPlatformAPIPath owns that one.
		{name: "platform openapi json", path: "/api/platform-openapi.json", expected: false},
		{name: "platform openapi yaml", path: "/api/platform-openapi.yaml", expected: false},
		{name: "platform openapi 3.0 variant", path: "/api/platform-openapi-3.0.json", expected: false},
		{name: "protected api", path: "/api/releases", expected: false},
		{name: "non api", path: "/health", expected: false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := IsPublicAPIPath(tc.path); got != tc.expected {
				t.Fatalf("IsPublicAPIPath(%q) = %v, want %v", tc.path, got, tc.expected)
			}
		})
	}
}

// TestIsPublicPlatformAPIPath is the internal listener's half of the same
// question. It allowlists the Platform document and its reference page and
// nothing else -- every operation stays behind the platform authenticator, on a
// port that is unroutable from outside, because "unreachable" is a second control
// and never the only one.
func TestIsPublicPlatformAPIPath(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name     string
		path     string
		expected bool
	}{
		{name: "platform openapi json", path: "/api/platform-openapi.json", expected: true},
		{name: "platform openapi yaml", path: "/api/platform-openapi.yaml", expected: true},
		{name: "platform openapi 3.0 variant", path: "/api/platform-openapi-3.0.json", expected: true},
		{name: "docs root", path: "/api/docs", expected: true},
		{name: "docs asset", path: "/api/docs/scalar.css", expected: true},
		{name: "platform operation", path: "/api/platform/me", expected: false},
		{name: "platform organization operation", path: "/api/platform/organizations/x", expected: false},
		// The Platform document's schema routes are not public, matching the Core
		// listener, where /api/schemas is not public either.
		{name: "platform schemas", path: "/api/platform-schemas/Foo.json", expected: false},
		// Nothing else answers on this listener; the predicate must not claim
		// otherwise for a path the Core listener happens to make public.
		{name: "token validate", path: "/api/tokens/validate", expected: false},
		{name: "core openapi", path: "/api/openapi.json", expected: false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := IsPublicPlatformAPIPath(tc.path); got != tc.expected {
				t.Fatalf("IsPublicPlatformAPIPath(%q) = %v, want %v", tc.path, got, tc.expected)
			}
		})
	}
}

func TestOpenAPIRoutesAreRegistered(t *testing.T) {
	t.Parallel()

	s, err := New(context.Background(), Dependencies{}, config.Config{})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	paths := map[string]bool{}
	for _, routes := range s.Router().Stack() {
		for _, route := range routes {
			paths[route.Path] = true
		}
	}

	if !paths["/api/openapi.json"] {
		t.Fatalf("expected an OpenAPI route to be registered, got paths: %#v", paths)
	}
}

// TestEachListenerDocumentsItsOwnSurface is the served form of the split: each
// listener answers /api/docs with a page over the one document it serves, and
// mentions no other.
//
// One page over both surfaces was the arrangement while they shared a port. It
// cannot survive the split, because half the links would point at a spec the
// listener being read does not serve -- a reader on the public port would be
// offered a Platform document they cannot fetch, and a reader on the internal port
// the reverse. The page is read from the response rather than from
// kaitenhuma.docsPage's return value so the CSP header and the route wiring are
// covered too.
func TestEachListenerDocumentsItsOwnSurface(t *testing.T) {
	t.Parallel()

	s := newTestServer(t)

	testCases := []struct {
		name    string
		app     *fiber.App
		wants   []string
		unwants []string
	}{
		{
			name:    "core listener",
			app:     s.Router(),
			wants:   []string{"/api/openapi.json", "Core API"},
			unwants: []string{"/api/platform-openapi.json"},
		},
		{
			name:    "platform listener",
			app:     s.PlatformRouter(),
			wants:   []string{"/api/platform-openapi.json", "Platform API"},
			unwants: []string{"/api/openapi.json"},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			resp, err := tc.app.Test(httptest.NewRequest(http.MethodGet, "/api"+kaitenhuma.DocsPath, nil))
			if err != nil {
				t.Fatalf("GET %s error = %v", "/api"+kaitenhuma.DocsPath, err)
			}
			defer func() {
				if err := resp.Body.Close(); err != nil {
					t.Errorf("closing the response body: %v", err)
				}
			}()

			if resp.StatusCode != http.StatusOK {
				t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
			}
			if got := resp.Header.Get(fiber.HeaderContentType); !strings.HasPrefix(got, fiber.MIMETextHTML) {
				t.Errorf("Content-Type = %q, want HTML", got)
			}
			if resp.Header.Get("Content-Security-Policy") == "" {
				t.Error("the documentation page must carry a Content-Security-Policy")
			}

			raw, err := io.ReadAll(resp.Body)
			if err != nil {
				t.Fatalf("reading the response body: %v", err)
			}
			body := string(raw)

			for _, want := range tc.wants {
				if !strings.Contains(body, want) {
					t.Errorf("the documentation page does not mention %q", want)
				}
			}
			for _, unwanted := range tc.unwants {
				if strings.Contains(body, unwanted) {
					t.Errorf("the documentation page links %q, which this listener does not serve", unwanted)
				}
			}
		})
	}
}

// Everything in front of this service routes on the /api prefix, so a
// documentation route mounted on the raw router as well would be an
// undocumented second public surface for the same spec.
func TestDocumentationRoutesOnlyMountedUnderAPI(t *testing.T) {
	t.Parallel()

	s, err := New(context.Background(), Dependencies{}, config.Config{})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	// The substrings huma derives its documentation routes from: OpenAPIPath
	// ("/openapi", plus .json/.yaml and the 3.0 variants), DocsPath ("/docs")
	// and SchemasPath ("/schemas").
	documentationMarkers := []string{"openapi", "docs", "schemas"}

	for _, routes := range s.Router().Stack() {
		for _, route := range routes {
			if strings.HasPrefix(route.Path, "/api/") || route.Path == "/api" {
				continue
			}
			for _, marker := range documentationMarkers {
				if strings.Contains(route.Path, marker) {
					t.Errorf("documentation route %q is registered outside the /api group", route.Path)
				}
			}
		}
	}
}

func TestOpenAPIServersUseAPIPrefix(t *testing.T) {
	t.Parallel()

	s, err := New(context.Background(), Dependencies{}, config.Config{})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	servers := s.API().OpenAPI().Servers
	if len(servers) == 0 {
		t.Fatal("expected at least one OpenAPI server to be configured")
	}

	if servers[0].URL != "/api" {
		t.Fatalf("expected first OpenAPI server URL to be /api, got %q", servers[0].URL)
	}
}

func TestIntegrationNameOpenAPIExamplesUseCanonicalConnectorName(t *testing.T) {
	t.Parallel()

	s, err := New(context.Background(), Dependencies{}, config.Config{})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	testCases := []struct {
		name   string
		path   string
		method string
	}{
		{name: "create customer", path: "/customers/{customerSlug}/integrations/{integrationName}", method: http.MethodPost},
		{name: "get customer", path: "/customers/{customerSlug}/integrations/{integrationName}", method: http.MethodGet},
		{name: "update customer", path: "/customers/{customerSlug}/integrations/{integrationName}", method: http.MethodPut},
		{name: "delete customer", path: "/customers/{customerSlug}/integrations/{integrationName}", method: http.MethodDelete},
		{name: "create instance", path: "/instances/{instanceSlug}/integrations/{integrationName}", method: http.MethodPost},
		{name: "get instance", path: "/instances/{instanceSlug}/integrations/{integrationName}", method: http.MethodGet},
		{name: "update instance", path: "/instances/{instanceSlug}/integrations/{integrationName}", method: http.MethodPut},
		{name: "delete instance", path: "/instances/{instanceSlug}/integrations/{integrationName}", method: http.MethodDelete},
	}

	const expected = "kaiten.integration.crm.attio"
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			pathItem := s.API().OpenAPI().Paths[tc.path]
			if pathItem == nil {
				t.Fatalf("OpenAPI path %q is not registered", tc.path)
				return
			}

			operation := openAPIOperation(pathItem, tc.method)
			if operation == nil {
				t.Fatalf("OpenAPI operation %s %s is not registered", tc.method, tc.path)
				return
			}

			for _, parameter := range operation.Parameters {
				if parameter.Name != "integrationName" || parameter.In != "path" {
					continue
				}
				if parameter.Schema == nil || len(parameter.Schema.Examples) != 1 {
					t.Fatalf("expected one integrationName schema example, got %#v", parameter.Schema)
				}
				if got, ok := parameter.Schema.Examples[0].(string); !ok || got != expected {
					t.Fatalf("integrationName example = %#v, want %q", parameter.Schema.Examples[0], expected)
				}
				return
			}

			t.Fatal("integrationName path parameter is not registered")
		})
	}
}

func openAPIOperation(pathItem *huma.PathItem, method string) *huma.Operation {
	switch method {
	case http.MethodGet:
		return pathItem.Get
	case http.MethodPost:
		return pathItem.Post
	case http.MethodPut:
		return pathItem.Put
	case http.MethodDelete:
		return pathItem.Delete
	default:
		return nil
	}
}

func TestNewRejectsInvalidMeteredConfig(t *testing.T) {
	t.Parallel()

	s, err := New(context.Background(), Dependencies{}, config.Config{
		CoreConfig: config.CoreConfig{Metered: config.Metered{Enabled: true}},
	})

	if err == nil {
		t.Fatal("New() error = nil, want invalid dogfooding configuration error")
	}
	if s != nil {
		t.Fatal("New() server is non-nil on invalid configuration")
	}
}

func TestNewRejectsAuthWithoutDB(t *testing.T) {
	t.Parallel()

	s, err := New(context.Background(), Dependencies{
		Auth: auth.New(),
	}, config.Config{})

	if err == nil {
		t.Fatal("New() error = nil, want auth-without-DB error")
	}
	if s != nil {
		t.Fatal("New() server is non-nil on invalid configuration")
	}
}

// TestThePlatformAuthenticatorIsBuiltRatherThanSupplied covers the wiring mistake
// the two-listener split makes possible: authenticating the public port and
// leaving the internal one open.
func TestThePlatformAuthenticatorIsBuiltRatherThanSupplied(t *testing.T) {
	t.Parallel()

	t.Run("built from the application when there is one", func(t *testing.T) {
		s := newTestServer(t)

		if s.app == nil {
			t.Fatal("the test server has no application; this test cannot say anything")
		}
		if s.platformAuthenticator() == nil {
			t.Fatal("a server with an application must authenticate its Platform listener")
		}
	})

	t.Run("an injected one wins, for tests that stand in for a credential", func(t *testing.T) {
		stub := auth.NewPlatform(nil)

		s, err := New(context.Background(), Dependencies{PlatformAuth: stub}, config.Config{})
		if err != nil {
			t.Fatalf("New() error = %v", err)
		}

		if s.platformAuthenticator() != auth.Middleware(stub) {
			t.Fatal("Dependencies.PlatformAuth must override the built authenticator")
		}
	})
}
