package huma

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"regexp"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// coreConfig and platformConfig mirror the two configs server.setupAPI builds:
// same group, same server prefix, different OpenAPIPath. Restated here rather
// than imported because internal/infrastructure/http/server imports this
// package.
func coreConfig() huma.Config {
	config := huma.DefaultConfig("Kaiten API", "1.0.0")
	config.Servers = []*huma.Server{{URL: "/api"}}
	config.DocsPath = ""
	return config
}

func platformConfig() huma.Config {
	config := huma.DefaultConfig("Kaiten Platform API", "1.0.0")
	config.Servers = []*huma.Server{{URL: "/api"}}
	config.OpenAPIPath = "/platform-openapi"
	config.SchemasPath = "/platform-schemas"
	config.DocsPath = ""
	return config
}

// TestDocumentURLJoinsTheServerPrefix is the reason DocSource carries a
// huma.Config instead of a URL string: the link on the page and the route the
// document is actually served on are derived from the same two fields, so they
// cannot drift.
func TestDocumentURLJoinsTheServerPrefix(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name     string
		source   DocSource
		expected string
	}{
		{
			name:     "core",
			source:   DocSource{Title: "Core API", Config: coreConfig(), Default: true},
			expected: "/api/openapi.json",
		},
		{
			name:     "platform",
			source:   DocSource{Title: "Platform API", Config: platformConfig()},
			expected: "/api/platform-openapi.json",
		},
		{
			name: "no server declared",
			source: DocSource{Title: "Bare", Config: func() huma.Config {
				config := huma.DefaultConfig("Bare", "1.0.0")
				config.Servers = nil
				return config
			}()},
			expected: "/openapi.json",
		},
		{
			name: "absolute server url contributes only its path",
			source: DocSource{Title: "Absolute", Config: func() huma.Config {
				config := huma.DefaultConfig("Absolute", "1.0.0")
				config.Servers = []*huma.Server{{URL: "https://kaiten.example.com/api"}}
				return config
			}()},
			expected: "/api/openapi.json",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tc.expected, tc.source.documentURL())
		})
	}
}

// bootstrapScript extracts the configuration out of the page's one inline script.
// Matching the createApiReference call is the point: the `data-configuration`
// attribute cannot carry `sources` (Scalar's HTML entry point runs it through a
// single-document schema that strips the key), so this call is the only channel the
// page has -- see docsPage.
var bootstrapScript = regexp.MustCompile(`<script>window\.Scalar\.createApiReference\("#[a-z-]+", (.*)\);</script>`)

// renderDocs is docsPage with the configuration already extracted.
func renderDocs(t *testing.T, sources []DocSource) (page string, hash string, config scalarConfiguration) {
	t.Helper()

	page, hash = docsPage(sources)

	matches := bootstrapScript.FindStringSubmatch(page)
	require.Len(t, matches, 2, "the page must bootstrap Scalar with an inline createApiReference call")
	require.NoError(t, json.Unmarshal([]byte(matches[1]), &config),
		"the configuration must be JSON Scalar can use")

	return page, hash, config
}

func TestDocsPageListsEveryDocument(t *testing.T) {
	t.Parallel()

	page, _, payload := renderDocs(t, []DocSource{
		{Title: "Core API", Config: coreConfig(), Default: true},
		{Title: "Platform API", Config: platformConfig()},
	})

	require.Len(t, payload.Sources, 2)
	assert.Equal(t, "Core API", payload.Sources[0].Title)
	assert.Equal(t, "/api/openapi.json", payload.Sources[0].URL)
	assert.True(t, payload.Sources[0].Default, "the Core document opens first")
	assert.Equal(t, "Platform API", payload.Sources[1].Title)
	assert.Equal(t, "/api/platform-openapi.json", payload.Sources[1].URL)
	assert.False(t, payload.Sources[1].Default)

	// The auto-boot in Scalar's standalone bundle mounts an EMPTY reference into
	// any element with this id, beside the configured one.
	assert.NotContains(t, page, `id="api-reference"`,
		"an element named api-reference makes the bundle auto-boot a second, empty reference")

	// The page title comes from the default document, so a reader arriving at
	// /api/docs sees the product's own name rather than "API Reference".
	assert.Contains(t, page, "<title>Kaiten API Reference</title>")

	// Pinned to huma's own renderer, version and integrity hash included: that
	// identity is what lets the chart's existing docs CSP stay untouched.
	assert.Contains(t, page, scalarScript)
	assert.Contains(t, page, scalarIntegrity)
}

// TestDocsPageWithoutSourcesStillRenders covers the branch RegisterDocs cannot
// be trusted not to reach: a registration mistake should produce a visibly empty
// reference page, not a panic on a request.
func TestDocsPageWithoutSourcesStillRenders(t *testing.T) {
	t.Parallel()

	page, _, payload := renderDocs(t, nil)

	assert.Empty(t, payload.Sources)
	assert.Contains(t, page, "<title>API Reference</title>")
}

// TestDocsPageMakesNoThirdPartyRequest is the fix for "the docs isn't working
// locally", stated as the property rather than as the two console errors that
// revealed it.
//
// docsCSP names no host but the pinned renderer script, so anything Scalar would
// fetch from fonts.scalar.com or api.scalar.com is refused and the page renders
// broken. The configuration is what keeps it from asking: the fonts and the AI
// agent -- the only two features that reach a third party -- are off, on the
// top-level config AND on every source, because Scalar resolves some options
// against the active document.
//
// Asserted on the configuration rather than on the CSP because that is the half a
// future edit is likely to get wrong: widening the CSP to Scalar's hosts would
// make the page work and would make every reader of a private API's documentation
// issue requests to a third party.
func TestDocsPageMakesNoThirdPartyRequest(t *testing.T) {
	t.Parallel()

	_, hash, payload := renderDocs(t, []DocSource{
		{Title: "Core API", Config: coreConfig(), Default: true},
		{Title: "Platform API", Config: platformConfig()},
	})

	assert.False(t, payload.WithDefaultFonts, "Scalar's default fonts come from fonts.scalar.com")
	assert.True(t, payload.Agent.Disabled, "the agent fetches api.scalar.com through proxy.scalar.com")
	assert.Empty(t, payload.ProxyURL, "an omitted proxyUrl defaults to proxy.scalar.com")

	require.Len(t, payload.Sources, 2)
	for _, source := range payload.Sources {
		assert.True(t, source.Agent.Disabled, "%s: the agent is enabled per document", source.Title)
		assert.Empty(t, source.ProxyURL, "%s: the proxy is set per document", source.Title)
	}

	// The one host the page is allowed to reach, and the only one it needs.
	for _, directive := range docsCSP(hash) {
		if strings.HasPrefix(directive, "default-src") {
			assert.Equal(t, "default-src 'none'", directive)
		}
		assert.NotContains(t, directive, "scalar.com",
			"docsCSP admitted a Scalar host; disable the feature that wants it instead")
	}
}

// TestDocsCSPAdmitsOnlyThePageOwnInlineScript states the constraint the page is
// shaped around. The policy still refuses 'unsafe-inline'; the one inline script
// the page needs (see docsPage) is admitted by its SHA-256 instead, so an injected
// inline script does not run even though the page has one of its own.
func TestDocsCSPAdmitsOnlyThePageOwnInlineScript(t *testing.T) {
	t.Parallel()

	page, hash := docsPage([]DocSource{{Title: "Core API", Config: coreConfig(), Default: true}})

	var scriptSrc string
	for _, directive := range docsCSP(hash) {
		if strings.HasPrefix(directive, "script-src ") {
			scriptSrc = directive
		}
	}

	require.NotEmpty(t, scriptSrc, "the policy must constrain script-src")
	assert.NotContains(t, scriptSrc, "'unsafe-inline'")
	assert.Contains(t, scriptSrc, scalarScript)
	assert.Contains(t, scriptSrc, "'sha256-"+hash+"'")

	// The hash has to be of the bytes actually served, or the browser refuses the
	// page's own bootstrap and renders nothing. Recomputing it from the rendered
	// page is what proves the two cannot drift.
	inline := bootstrapScript.FindStringSubmatch(page)
	require.Len(t, inline, 2)
	served := `window.Scalar.createApiReference("#` + mountID + `", ` + inline[1] + `);`
	digest := sha256.Sum256([]byte(served))
	assert.Equal(t, base64.StdEncoding.EncodeToString(digest[:]), hash,
		"the CSP hash does not cover the script the page serves")
}

// TestDocsPageCannotBeClosedByADocumentTitle is the injection property, one level
// up from the encoder: the configuration now travels inside a <script> block, so a
// title carrying "</script>" must not be able to end it. encoding/json escapes
// <, > and & to \u003c, \u003e and \u0026 by default, which is what makes that
// impossible -- asserted here because switching to an encoder with
// SetEscapeHTML(false) would silently remove the protection.
func TestDocsPageCannotBeClosedByADocumentTitle(t *testing.T) {
	t.Parallel()

	page, hash, config := renderDocs(t, []DocSource{
		{Title: `Core</script><script>alert(1)</script>`, Config: coreConfig(), Default: true},
	})

	assert.NotContains(t, page, "</script><script>alert(1)",
		"a document title closed the page's own script block")
	assert.Contains(t, page, `\u003c/script\u003e`, "the title must reach the page escaped")

	// Escaped, not mangled: the title still reads correctly once parsed.
	require.Len(t, config.Sources, 1)
	assert.Equal(t, `Core</script><script>alert(1)</script>`, config.Sources[0].Title)

	// And even if an escape were ever missed, the injected script would not be the
	// one the CSP hash names.
	assert.NotEmpty(t, hash)
}
