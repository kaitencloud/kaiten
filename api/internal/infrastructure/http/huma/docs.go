package huma

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/gofiber/fiber/v3"
)

// DocsPath is where the reference page is served, relative to the group it is
// registered on -- so /api/docs in practice. It is a constant because two other
// places already know this path: server.isPublicAPIPath (the page must be readable
// without a credential) and every link to the documentation.
const DocsPath = "/docs"

// scalarScript is the renderer huma would have used, pinned to the same version
// and served with the same subresource integrity hash (huma api.go:684). Keeping
// it identical means an upgrade of huma changes the renderer here for the same
// reason and at the same time as it would have on its own page -- and the
// integrity hash makes the pin a verified one rather than a comment.
const scalarScript = "https://unpkg.com/@scalar/api-reference@1.44.20/dist/browser/standalone.js"

const scalarIntegrity = "sha384-tMz7GAo6dMy55x9tLFtH+sHtogji6Scmb+feBR31TAHmvSPRUTboK9H3M5NFaP4R"

// docsCSP is the page's whole Content-Security-Policy, and this file is its only
// owner: RegisterDocs sets the header itself, so nothing in front of the API adds
// a second one. Two policies on one response are enforced as their intersection,
// which means a narrow app policy silently overrides a wide gateway policy and a
// reader gets a blank page with console errors instead of documentation. The
// -public HTTPRoute in charts/kaiten/templates/ingress/httproutes.yaml
// deliberately adds none for /api/docs.
func docsCSP(scriptHash string) []string {
	return []string{
		"default-src 'none'",
		"base-uri 'none'",
		"connect-src 'self'",
		"font-src 'self'",
		"form-action 'none'",
		"frame-ancestors 'none'",
		"img-src 'self' data:",
		"sandbox allow-same-origin allow-scripts",
		"script-src 'unsafe-eval' " + scalarScript + " 'sha256-" + scriptHash + "'",
		"style-src 'unsafe-inline'",
	}
}

// DocSource is one OpenAPI document on the reference page.
//
// It carries the document's own huma.Config rather than a URL string so the page
// cannot point at a path the API does not serve: both the spec route and the link
// to it are derived from the same field.
type DocSource struct {
	// Title labels the document in the page's document picker.
	Title string
	// Config is the document's configuration, as handed to humafiber.
	Config huma.Config
	// Default marks the document shown on first load. With none marked, Scalar
	// shows the first.
	Default bool
}

// documentURL is the browser-visible path of this document's JSON, derived the
// way huma derives it for its own docs page (api.go:571-574): the server prefix
// joined with the configured OpenAPI path. Both APIs are mounted on the /api
// group and declare Servers[0].URL == "/api", so this yields /api/openapi.json
// and /api/platform-openapi.json.
func (s DocSource) documentURL() string {
	openAPIPath := s.Config.OpenAPIPath
	if prefix := serverPrefix(s.Config); prefix != "" {
		openAPIPath = path.Join(prefix, openAPIPath)
	}
	return openAPIPath + ".json"
}

// serverPrefix reads the path component of the document's first server entry.
// huma keeps the equivalent helper unexported, so this restates it rather than
// reaching into the package.
func serverPrefix(config huma.Config) string {
	if config.OpenAPI == nil || len(config.Servers) == 0 || config.Servers[0] == nil {
		return ""
	}
	parsed, err := url.Parse(config.Servers[0].URL)
	if err != nil {
		return ""
	}
	return parsed.Path
}

// RegisterDocs serves one Scalar page over several OpenAPI documents.
//
// huma's own renderer takes a single spec URL and is skipped entirely when
// DocsPath is empty (api.go:628), which is why both configs set it empty and this
// replaces it rather than wrapping it. The Core and Platform documents are
// deliberately separate -- see ConfigurePlatformSecurity -- but a reader looking
// for an operation should not have to know which surface it lives on first.
func RegisterDocs(router fiber.Router, sources []DocSource) {
	body, scriptHash := docsPage(sources)
	policy := strings.Join(docsCSP(scriptHash), "; ")

	router.Get(DocsPath, func(c fiber.Ctx) error {
		c.Set("Content-Security-Policy", policy)
		c.Set(fiber.HeaderContentType, fiber.MIMETextHTMLCharsetUTF8)
		return c.Status(http.StatusOK).SendString(body)
	})
}

// mountID is the element Scalar renders into.
//
// Deliberately NOT "api-reference": the standalone bundle auto-boots on load and
// looks for exactly that id (getElementById("api-reference")), so an element by
// that name would make it mount a SECOND, empty reference beside the configured
// one. With no such element and no legacy [data-spec] attribute, the auto-boot
// finds no mount point and does nothing, leaving the page to createApiReference.
const mountID = "scalar-api-reference"

// scalarSource is one entry of Scalar's `sources` option.
//
// Agent and ProxyURL are repeated per source as well as set at the top level:
// Scalar resolves several options against the ACTIVE document's config (the
// top-level object is spread into each source and then the source wins), so a
// top-level value alone is a default a source could shadow. Setting both is free
// and leaves no reading of the merge in which the agent comes back on.
type scalarSource struct {
	Title   string      `json:"title"`
	URL     string      `json:"url"`
	Default bool        `json:"default,omitempty"`
	Agent   scalarAgent `json:"agent"`
	// ProxyURL is empty, not absent: Scalar defaults it to proxy.scalar.com, and
	// an omitted field would take that default.
	ProxyURL string `json:"proxyUrl"`
}

// scalarAgent disables Scalar's AI assistant. It is what fetches
// api.scalar.com/vector/registry/* through proxy.scalar.com -- both a violation of
// this page's policy and a third-party request made on behalf of someone reading a
// private API's documentation.
type scalarAgent struct {
	Disabled bool `json:"disabled"`
}

// scalarConfiguration is the object handed to Scalar.createApiReference.
//
// WithDefaultFonts is false because Scalar's default typography is fourteen
// webfont files from fonts.scalar.com. Off, the page falls back to the system
// stack, which is what lets docsCSP name no third-party host.
type scalarConfiguration struct {
	Sources          []scalarSource `json:"sources"`
	WithDefaultFonts bool           `json:"withDefaultFonts"`
	Agent            scalarAgent    `json:"agent"`
	ProxyURL         string         `json:"proxyUrl"`
	// DocumentDownloadType is "none" because docsCSP's sandbox directive omits
	// allow-downloads, so the download control cannot work. Hiding it beats
	// offering a button that silently does nothing; both spec documents are plain
	// GETs at stable paths. (The older hideDownloadButton spelling for this is
	// deprecated and logs a warning.)
	DocumentDownloadType string `json:"documentDownloadType"`
}

// docsPage renders the page and returns it with the base64 SHA-256 of its inline
// script, which docsCSP needs.
//
// The configuration travels in an inline script calling
// Scalar.createApiReference, NOT in the `data-configuration` attribute of a
// #api-reference element -- and that is the whole reason this page has an inline
// script at all.
//
// The attribute route cannot carry `sources`. Scalar's HTML entry point reads the
// attribute and then runs the result through its single-document zod schema
// (apiReferenceConfigurationSchema), which strips every key it does not declare,
// and `sources` is not one of them. The page then mounted with no documents: a
// sidebar reading "Sidebar for undefined", no request for either openapi.json,
// and -- because the active document could not be found -- the config defaults
// restored, which is what re-enabled the fonts and the agent that the CSP was
// then blamed for. createApiReference receives the object as-is, with no schema in
// between, and is the supported multi-document API.
//
// An inline script is normally what a policy like docsCSP exists to forbid, so it
// is admitted by HASH rather than by 'unsafe-inline': the browser runs this exact
// byte sequence and refuses every other inline script, including an injected one.
// The hash is computed from the same string that is embedded, so the two cannot
// drift.
func docsPage(sources []DocSource) (page string, scriptHash string) {
	disabled := scalarAgent{Disabled: true}

	configured := make([]scalarSource, 0, len(sources))
	for _, source := range sources {
		configured = append(configured, scalarSource{
			Title:    source.Title,
			URL:      source.documentURL(),
			Default:  source.Default,
			Agent:    disabled,
			ProxyURL: "",
		})
	}

	// Marshalling cannot fail for this shape, and a docs page is not worth
	// propagating an error nobody can act on -- an empty list renders a page
	// that says it has no documents, which is the visible form of the bug.
	payload, err := json.Marshal(scalarConfiguration{
		Sources:              configured,
		WithDefaultFonts:     false,
		Agent:                disabled,
		ProxyURL:             "",
		DocumentDownloadType: "none",
	})
	if err != nil {
		payload = []byte(`{"sources":[]}`)
	}

	title := "API Reference"
	for _, source := range sources {
		if source.Default && source.Config.Info != nil && source.Config.Info.Title != "" {
			title = source.Config.Info.Title + " Reference"
			break
		}
	}

	bootstrap := `window.Scalar.createApiReference(` + strconv.Quote("#"+mountID) + `, ` + string(payload) + `);`
	digest := sha256.Sum256([]byte(bootstrap))

	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="referrer" content="no-referrer">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>` + title + `</title>
  </head>
  <body>
    <div id="` + mountID + `"></div>
    <script src="` + scalarScript + `" crossorigin integrity="` + scalarIntegrity + `"></script>
    <script>` + bootstrap + `</script>
  </body>
</html>`, base64.StdEncoding.EncodeToString(digest[:])
}
