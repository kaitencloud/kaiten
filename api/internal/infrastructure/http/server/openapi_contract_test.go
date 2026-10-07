package server

import (
	"context"
	"encoding/json"
	"regexp"
	"slices"
	"sort"
	"strings"
	"testing"
	"unicode"

	"github.com/danielgtaylor/huma/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// This file lints the published contract itself. It builds the very
// documents cmd/docs writes to app/openapi.yaml and
// app/platform-openapi.yaml (server.New with no dependencies is exactly what
// the generator does) and asserts the properties the contract is supposed to
// have, so a regression is a failing unit test rather than something a reader
// of the SDK notices months later.
//
// Both documents are held to the same rules, and every rule that mentions a
// security scheme takes it as a parameter. That is deliberate: the Core and
// Platform surfaces publish DIFFERENT schemes (bearerAuth vs platformAuth),
// and a shared assertion that hardcoded one would quietly stop covering the
// other -- so the two are named at the call site instead.

func newContractDocument(t *testing.T) *huma.OpenAPI {
	t.Helper()

	s, err := New(context.Background(), Dependencies{}, config.Config{})
	require.NoError(t, err)
	return s.API().OpenAPI()
}

// newPlatformContractDocument is the Platform API's document, built from the
// same server the Core one comes from -- the two are separate documents on one
// process, not separate deployments.
func newPlatformContractDocument(t *testing.T) *huma.OpenAPI {
	t.Helper()

	s, err := New(context.Background(), Dependencies{}, config.Config{})
	require.NoError(t, err)
	return s.PlatformAPI().OpenAPI()
}

// Run once per document with that document's own scheme, which is what turns
// ConfigurePlatformSecurity's obligation into an assertion rather than an
// assumption.
func TestContractDeclaresBearerAuthentication(t *testing.T) {
	t.Run("core", func(t *testing.T) {
		assertDocumentDeclaresScheme(t, newContractDocument(t), kaitenhuma.BearerAuth)
	})
	t.Run("platform", func(t *testing.T) {
		assertDocumentDeclaresScheme(t, newPlatformContractDocument(t), kaitenhuma.PlatformAuth)
	})
}

func assertDocumentDeclaresScheme(t *testing.T, oapi *huma.OpenAPI, expectedScheme string) {
	t.Helper()

	require.NotNil(t, oapi.Components)
	scheme := oapi.Components.SecuritySchemes[expectedScheme]
	require.NotNil(t, scheme, "the document must declare a %q security scheme", expectedScheme)
	assert.Equal(t, "http", scheme.Type)
	assert.Equal(t, "bearer", scheme.Scheme)

	require.NotEmpty(t, oapi.Security, "the scheme must also be the document-level default")
	_, ok := oapi.Security[0][expectedScheme]
	assert.True(t, ok)
}

// The scope in the document is projected by kaitenhuma.RegisterScoped and
// RegisterPlatform from the same argument the facade method behind the operation
// requires, so an operation that declares one is an operation something enforces.
// This checks the other direction: that every enforced scope was also published,
// on the surface a client actually reads.
func TestEveryOperationDeclaresItsScope(t *testing.T) {
	t.Run("core", func(t *testing.T) {
		assertEveryOperationDeclaresItsScope(t, newContractDocument(t), kaitenhuma.BearerAuth)
	})
	t.Run("platform", func(t *testing.T) {
		assertEveryOperationDeclaresItsScope(t, newPlatformContractDocument(t), kaitenhuma.PlatformAuth)
	})
}

func assertEveryOperationDeclaresItsScope(t *testing.T, oapi *huma.OpenAPI, expectedScheme string) {
	t.Helper()

	count := 0
	eachOperation(oapi, func(method, path string, op *huma.Operation) {
		count++
		require.NotEmpty(t, op.Security, "%s %s (%s) declares no security requirement", method, path, op.OperationID)

		// The public SDK surface takes credentials that carry no scope -- a
		// publishable key on /public, a customer session on /public/session --
		// and each declares its scheme alone, on its paths and only there.
		onSessionPath := strings.HasPrefix(path, kaitenhuma.SessionPathPrefix+"/")
		onPublicPath := strings.HasPrefix(path, kaitenhuma.PublicPathPrefix+"/") && !onSessionPath
		for _, surface := range []struct {
			scheme string
			on     bool
		}{{kaitenhuma.PublishableKeyAuth, onPublicPath}, {kaitenhuma.CustomerSessionAuth, onSessionPath}} {
			scopes, declared := op.Security[0][surface.scheme]
			require.Equal(t, surface.on, declared,
				"%s %s: the %s scheme belongs to its own public paths and only to them", method, path, surface.scheme)
			if declared {
				require.Len(t, op.Security, 1, "%s %s must accept its one public credential and nothing else", method, path)
				require.Len(t, op.Security[0], 1, "%s %s must accept its one public credential and nothing else", method, path)
				require.Empty(t, scopes, "%s %s: a public credential carries no scope to require", method, path)
			}
		}
		if onPublicPath || onSessionPath {
			return
		}

		scopes, ok := op.Security[0][expectedScheme]
		require.True(t, ok, "%s %s must require the %q scheme", method, path, expectedScheme)
		require.NotEmpty(t, scopes, "%s %s must say which scope it needs", method, path)

		for _, s := range scopes {
			assert.True(t, scope.IsValidScope(s), "%s %s requires unknown scope %q", method, path, s)
		}
	})

	assert.Positive(t, count)
}

// TestPlatformContractDeclaresNoOrganizationCredential is the contract-level
// form of the credential-class partition: the Platform document must not offer
// a generated client the organization scheme anywhere, not even as a fallback
// alternative on one operation. A client that could send `bearerAuth` here
// would be a client that crosses the two credential classes by accident, which
// is the whole reason the schemes are separate.
func TestPlatformContractDeclaresNoOrganizationCredential(t *testing.T) {
	oapi := newPlatformContractDocument(t)

	require.NotNil(t, oapi.Components)
	assert.NotContains(t, oapi.Components.SecuritySchemes, kaitenhuma.BearerAuth,
		"the Platform document must not publish the organization scheme at all")

	for _, requirement := range oapi.Security {
		assert.NotContains(t, requirement, kaitenhuma.BearerAuth,
			"the Platform document's default security must not offer %q", kaitenhuma.BearerAuth)
	}

	eachOperation(oapi, func(method, path string, op *huma.Operation) {
		for _, requirement := range op.Security {
			assert.NotContains(t, requirement, kaitenhuma.BearerAuth,
				"%s %s accepts %q", method, path, kaitenhuma.BearerAuth)
		}
	})
}

// TestContractPublishesOrganizationScopes pins the list the console's token
// picker is generated from (packages/api-codegen/generate-scopes.js). It is the
// Core scheme's own statement of what its credentials can carry, so it has to be
// in the document the picker reads, and whole.
func TestContractPublishesOrganizationScopes(t *testing.T) {
	scheme := newContractDocument(t).Components.SecuritySchemes[kaitenhuma.BearerAuth]
	require.NotNil(t, scheme)

	assert.Equal(t, scope.OrganizationScopes(), scheme.Extensions[kaitenhuma.ScopesExtension])
}

// TestCoreOperationsRequireOrganizationScopes is the direction the picker depends
// on: an operation requiring a scope the list leaves out could never be granted
// from the console, whatever the token.
func TestCoreOperationsRequireOrganizationScopes(t *testing.T) {
	published := make(map[string]bool)
	for _, s := range scope.OrganizationScopes() {
		published[s] = true
	}

	eachOperation(newContractDocument(t), func(method, path string, op *huma.Operation) {
		for _, requirement := range op.Security {
			for _, s := range requirement[kaitenhuma.BearerAuth] {
				assert.True(t, published[s],
					"%s %s requires %q, which scope.OrganizationScopes leaves out: no token picker could grant it", method, path, s)
			}
		}
	})
}

// organizationModulesEnforcedElsewhere records the organization modules that no
// Core operation enforces, with the service that does. They are offered like any
// other, and that is only right if something checks them.
var organizationModulesEnforcedElsewhere = map[scope.Module]string{
	scope.Webhooks: "the outbound webhooks service: /api/webhooks, which checks read:/write:webhooks itself",
}

// TestEveryOrganizationModuleIsEnforced makes a new module a decision: the
// picker offers every organization module, so one that no Core operation enforces
// is either enforced by another service (recorded above) or platform-only (listed
// in pkg/scope). Left to the default, it would be offered and grant nothing.
func TestEveryOrganizationModuleIsEnforced(t *testing.T) {
	core := modulesEnforcedBy(newContractDocument(t), kaitenhuma.BearerAuth)

	for _, module := range scope.OrganizationModules() {
		enforcer, elsewhere := organizationModulesEnforcedElsewhere[module]
		switch {
		case core[module] && elsewhere:
			t.Errorf("%q is enforced by Core operations now; drop it from organizationModulesEnforcedElsewhere (%s)", module, enforcer)
		case !core[module] && !elsewhere:
			t.Errorf("no Core operation enforces %q, yet the token picker offers it: record the service that does in organizationModulesEnforcedElsewhere, or make it platform-only in pkg/scope", module)
		}
	}
}

// TestPlatformOnlyModulesAreEnforcedOnThePlatform keeps pkg/scope's exclusion
// list honest in the other direction: a module it withholds from organizations
// must be one the Platform API actually enforces, not a right no credential can use.
func TestPlatformOnlyModulesAreEnforcedOnThePlatform(t *testing.T) {
	platform := modulesEnforcedBy(newPlatformContractDocument(t), kaitenhuma.PlatformAuth)
	organization := make(map[scope.Module]bool)
	for _, module := range scope.OrganizationModules() {
		organization[module] = true
	}

	for _, s := range scope.AllScopes() {
		_, name, _ := strings.Cut(s, ":")
		if module := scope.Module(name); !organization[module] {
			assert.True(t, platform[module], "%q is withheld from organization credentials, but no Platform operation enforces it either", module)
		}
	}
}

// modulesEnforcedBy is the set of modules some operation of the document
// requires a scope on, under the given scheme.
func modulesEnforcedBy(oapi *huma.OpenAPI, scheme string) map[scope.Module]bool {
	modules := make(map[scope.Module]bool)
	eachOperation(oapi, func(_, _ string, op *huma.Operation) {
		for _, requirement := range op.Security {
			for _, s := range requirement[scheme] {
				if _, module, ok := strings.Cut(s, ":"); ok {
					modules[scope.Module(module)] = true
				}
			}
		}
	})
	return modules
}

// The business code lives in a dedicated `code` member of one shared schema,
// on Huma routes and Fiber ones alike.
func TestErrorResponsesUseOneShape(t *testing.T) {
	t.Run("core", func(t *testing.T) { assertErrorResponsesUseOneShape(t, newContractDocument(t)) })
	t.Run("platform", func(t *testing.T) {
		assertErrorResponsesUseOneShape(t, newPlatformContractDocument(t))
	})
}

func assertErrorResponsesUseOneShape(t *testing.T, oapi *huma.OpenAPI) {
	t.Helper()

	errorSchema := oapi.Components.Schemas.Map()["Problem"]
	require.NotNil(t, errorSchema, "the error schema must be published")
	assert.Contains(t, errorSchema.Properties, "code",
		"the machine-readable code needs a member of its own")
	assert.Contains(t, errorSchema.Properties, "detail")
	assert.Contains(t, errorSchema.Properties, "status")

	eachOperation(oapi, func(method, path string, op *huma.Operation) {
		for status, response := range op.Responses {
			if status < "400" || status > "599" {
				continue
			}
			for contentType, media := range response.Content {
				if media.Schema == nil || media.Schema.Ref == "" {
					continue
				}
				// The two OFREP routes answer with the OFREP-mandated
				// failure shape, which the spec they implement fixes; see
				// their registerOpenAPI comment.
				if slices.Contains(op.Tags, "OFREP Core") {
					continue
				}
				assert.Equal(t, "#/components/schemas/Problem", media.Schema.Ref,
					"%s %s %s (%s) does not use the shared error shape", method, path, status, contentType)
			}
		}
	})
}

// Resource schemas here are reused unmodified across GET/POST/PUT/PATCH, with
// readOnly marking the fields a write never supplies. Huma publishes one schema
// per Go type, so those fields appear as `required` in the request schema too.
// OpenAPI 3.1 permits that and says `required` applies to the response only for
// a readOnly property, so what matters is that a client following the contract
// is never rejected for omitting one -- which is what this asserts, against
// every schema the contract actually uses as a request body.
func TestReadOnlyPropertiesAreNotRequiredOnWrite(t *testing.T) {
	oapi := newContractDocument(t)

	raw, err := json.Marshal(oapi)
	require.NoError(t, err)

	var doc map[string]any
	require.NoError(t, json.Unmarshal(raw, &doc))

	components, _ := doc["components"].(map[string]any)
	rawSchemas, _ := components["schemas"].(map[string]any)
	require.NotEmpty(t, rawSchemas)

	reachable := map[string]bool{}
	var follow func(node any)
	follow = func(node any) {
		switch n := node.(type) {
		case map[string]any:
			if ref, ok := n["$ref"].(string); ok {
				name := strings.TrimPrefix(ref, "#/components/schemas/")
				if name != ref && !reachable[name] {
					reachable[name] = true
					follow(rawSchemas[name])
				}
			}
			for key, v := range n {
				if key != "$ref" {
					follow(v)
				}
			}
		case []any:
			for _, v := range n {
				follow(v)
			}
		}
	}

	var eachRequestBody func(node any)
	eachRequestBody = func(node any) {
		switch n := node.(type) {
		case map[string]any:
			if body, ok := n["requestBody"]; ok {
				follow(body)
			}
			for _, v := range n {
				eachRequestBody(v)
			}
		case []any:
			for _, v := range n {
				eachRequestBody(v)
			}
		}
	}
	eachRequestBody(doc["paths"])
	require.NotEmpty(t, reachable, "no request body schema found — the walk is broken, not the contract")

	require.NotNil(t, oapi.Components)
	schemas := oapi.Components.Schemas.Map()

	offenders := []string{}
	for name := range reachable {
		s, ok := schemas[name]
		if !ok || s.Properties == nil {
			continue
		}
		for property, definition := range s.Properties {
			if definition == nil || !definition.ReadOnly {
				continue
			}

			// The strictest possible write: nothing supplied at all. Other
			// required, non-readOnly properties will also (correctly) error
			// here — this only checks whether THIS readOnly property's own
			// required message is among them.
			pb := huma.NewPathBuffer([]byte(""), 0)
			res := &huma.ValidateResult{}
			huma.Validate(oapi.Components.Schemas, s, pb, huma.ModeWriteToServer, map[string]any{}, res)

			want := "expected required property " + property + " to be present"
			for _, e := range res.Errors {
				if e != nil && strings.Contains(e.Error(), want) {
					offenders = append(offenders, name+"."+property)
					break
				}
			}
		}
	}
	sort.Strings(offenders)

	assert.Empty(t, offenders, "write-mode validation still demands a readOnly property: %v\n"+
		"Huma's ModeWriteToServer should be skipping this. If it isn't, either the schema's "+
		"readOnly annotation isn't reaching the emitted document, or Huma's own behavior has "+
		"changed and this needs a fresh look, not a workaround.", offenders)
}

// transportWords are the words a component name may not contain. Every one
// of them names a piece of HTTP or of Huma's own plumbing rather than
// anything in the domain: Huma derives a component name from the Go struct
// name, so a `Body` field's type called `CreateCustomerBody` publishes a
// component by that name, and the consumer ends up holding three types per
// thing — the resource, its request wrapper, and its response wrapper —
// where the domain has one.
//
// `Item`, `Ref` and `Payload` are here for the same reason from the other
// direction: they describe a component's *role in a document* (an element of
// a list, a pointer to something else, the cargo of an envelope) instead of
// what it is. `EntitlementGroupUsageItem` became `EntitlementGroupUsage`,
// `EntitlementGroupRef` became `EntitlementGroupSummary`, and the nine
// `…Payload` webhook schemas took the name of the event they carry.
var transportWords = []string{
	"Body", "Input", "Request", "Response", "Payload", "Ref", "Item",
	"Dto", "Model", "Wrapper",
}

// domainNamesUsingTransportWords is the escape hatch the baseline below is
// not: a component whose name contains one of the words above because the
// *domain* uses it — a pricing model, a line item — rather than because a
// wrapper leaked. It is empty today. Adding to it is a claim about the
// domain's vocabulary and should read like one in the diff.
var domainNamesUsingTransportWords = map[string]bool{}

// containsTransportWord reports whether name contains word as a whole
// CamelCase word. `CustomerBody` and `EntitlementGroupRef` do; `Reference`
// and `Bodyguard` do not, because there the word is only a prefix of a longer
// one — which is why the check is the following rune rather than a regexp
// lookahead, something Go's RE2 has no equivalent for.
func containsTransportWord(name, word string) bool {
	for offset := 0; ; {
		index := strings.Index(name[offset:], word)
		if index < 0 {
			return false
		}
		end := offset + index + len(word)
		if end == len(name) || !unicode.IsLower(rune(name[end])) {
			return true
		}
		offset += index + 1
	}
}

// ofrepComponentNames are fixed by the OpenFeature Remote Evaluation
// Protocol, which this API implements rather than defines. Their names are
// part of a specification published elsewhere, so renaming them would break
// conformance, not improve it.
var ofrepComponentNames = map[string]bool{
	"EvaluationRequest":     true,
	"BulkEvaluationRequest": true,
}

// knownTransportComponentNames is a frozen baseline, exactly like
// knownNonCamelNames above: a list that may only shrink. Each entry is a
// request body still published as a component of its own, and each will
// disappear by being folded into the resource it describes — server-assigned
// members marked `readOnly`, accept-only members `writeOnly` — not by being
// renamed. A rename would keep the second component and only hide it from
// this test.
//
// Where a resource's create and update genuinely disagree about which fields
// are writable (most commonly a create-only `slug`), the fold keeps one schema
// and enforces the restriction in the handler instead of in a narrower wire
// type.
//
// The five entries left stay here on purpose rather than being folded at
// all: ReportEntitlementUsageBody (response is a computed snapshot, not an
// echo of the request), PatchInstanceBody (a genuine partial update against
// a much larger resource), ReorderMetadataFieldsInput (a bulk {ids: [...]}
// command with no resource shape to fold into), and CustomerBody/InstanceBody
// (the upsert-by-external-id integration endpoints, whose response is a
// different schema with different field casing — folding those means
// renaming wire JSON fields, a materially different change deferred on
// purpose).
//
// Nothing may be added beyond what's already deliberately kept. A new
// transport-named component means a new `Body`/`Input` struct was written
// where the resource schema should have been reused instead.
var knownTransportComponentNames = map[string]bool{
	"CustomerBody":               true,
	"InstanceBody":               true,
	"PatchInstanceBody":          true,
	"ReorderMetadataFieldsInput": true,
	"ReportEntitlementUsageBody": true,
}

// TestComponentNamesUseDomainVocabulary is the ratchet for the one thing a
// published component name has to be: the domain's word for the thing. It
// walks the component keys of the emitted document rather than the Go
// package, because the name a consumer reads is the one Huma derived, and a
// struct can be renamed without changing it (a `name:` override) or renamed
// by accident through a type alias.
//
// The baseline above is the current debt. This test's job is to stop it
// growing while that debt is paid down.
func TestComponentNamesUseDomainVocabulary(t *testing.T) {
	oapi := newContractDocument(t)

	require.NotNil(t, oapi.Components)
	schemas := oapi.Components.Schemas.Map()
	require.NotEmpty(t, schemas, "no components found — the walk is broken, not the contract")

	offenders := []string{}
	for name := range schemas {
		if ofrepComponentNames[name] || knownTransportComponentNames[name] ||
			domainNamesUsingTransportWords[name] {
			continue
		}
		for _, word := range transportWords {
			if containsTransportWord(name, word) {
				offenders = append(offenders, name+" (contains "+word+")")
				break
			}
		}
	}
	sort.Strings(offenders)

	assert.Empty(t, offenders, "components named after HTTP or Huma rather than the domain: %v\n"+
		"Name the Go type after the thing it represents. Do not add to "+
		"knownTransportComponentNames — that list only shrinks. If the word really is the "+
		"domain's own, say so in domainNamesUsingTransportWords.", offenders)
}

// The baseline in the other direction: an entry matching no component is debt
// already paid, and leaving it listed lets the same name come back unnoticed.
// Delete entries as the fold removes the components.
func TestFrozenTransportNamesStillExist(t *testing.T) {
	oapi := newContractDocument(t)

	require.NotNil(t, oapi.Components)
	schemas := oapi.Components.Schemas.Map()

	stale := []string{}
	for name := range knownTransportComponentNames {
		if _, ok := schemas[name]; !ok {
			stale = append(stale, name)
		}
	}
	sort.Strings(stale)

	assert.Empty(t, stale, "knownTransportComponentNames lists components that no longer exist: %v\n"+
		"Remove them — the baseline may only shrink, and a stale entry is an open door.", stale)
}

// camelCase is the naming rule the contract follows: lowerCamelCase, and no
// run of capitals, so an acronym reads `licenseId` rather than `licenseID`.
var (
	camelCase  = regexp.MustCompile(`^[a-z][a-zA-Z0-9]*$`)
	capitalRun = regexp.MustCompile(`[A-Z]{2,}`)
)

// knownNonCamelNames is a frozen baseline, not an exemption anyone should
// add to. Every entry is a naming bug already in the published contract
// (: contract details authored ad hoc per endpoint, with no gate).
// B4 fixed the two the audit called out — `lifecycle_stage` and
// `licenseID` — and froze the rest so the set can only shrink.
var knownNonCamelNames = map[string]bool{
	"changed_by":               true,
	"connector_name":           true,
	"created_at":               true,
	"default_variant":          true,
	"event_count":              true,
	"event_name":               true,
	"external_id":              true,
	"instance_id":              true,
	"last_error":               true,
	"new_lifecycle_stage":      true,
	"new_status":               true,
	"previous_lifecycle_stage": true,
	"previous_status":          true,
	"settings_schema":          true,
	"synced_at":                true,
	"updated_at":               true,
	"web_url":                  true,

	// B5 — webhook payload keys the contract now describes truthfully.
	"closed_period_end":   true,
	"closed_period_start": true,
	"entitlement_id":      true,
	"entitlement_slug":    true,
	"error_code":          true,
	"error_message":       true,
	"flag_id":             true,
	"flag_slug":           true,
	"is_synthetic":        true,
	"license_id":          true,
	"matched_rule_name":   true,
	"new_period_start":    true,
	"organization_id":     true,
}

// Walks the marshaled document — what consumers actually receive — rather
// than the Go structs, so a name introduced by a hand-written
// huma.Operation is caught too.
func TestContractNamingIsCamelCase(t *testing.T) {
	t.Run("core", func(t *testing.T) { assertContractNamingIsCamelCase(t, newContractDocument(t)) })
	t.Run("platform", func(t *testing.T) {
		assertContractNamingIsCamelCase(t, newPlatformContractDocument(t))
	})
}

func assertContractNamingIsCamelCase(t *testing.T, oapi *huma.OpenAPI) {
	t.Helper()

	raw, err := json.Marshal(oapi)
	require.NoError(t, err)

	var doc map[string]any
	require.NoError(t, json.Unmarshal(raw, &doc))

	offenders := map[string]bool{}
	walkNames(doc, func(name string) {
		if knownNonCamelNames[name] {
			return
		}
		if !camelCase.MatchString(name) || capitalRun.MatchString(name) {
			offenders[name] = true
		}
	})

	if len(offenders) == 0 {
		return
	}
	names := make([]string, 0, len(offenders))
	for name := range offenders {
		names = append(names, name)
	}
	sort.Strings(names)
	t.Fatalf("non-camelCase names in the published contract: %v\n"+
		"Rename the Go json/path/query tag. Do not add to knownNonCamelNames.", names)
}

// TestFixedContractNames pins the two renames themselves, so nothing
// silently reverts them while the baseline above still tolerates their
// neighbours.
func TestFixedContractNames(t *testing.T) {
	oapi := newContractDocument(t)
	schemas := oapi.Components.Schemas.Map()

	require.NotNil(t, schemas["PatchInstanceBody"])
	assert.Contains(t, schemas["PatchInstanceBody"].Properties, "lifecycleStage")
	assert.NotContains(t, schemas["PatchInstanceBody"].Properties, "lifecycle_stage")

	require.NotNil(t, schemas["LicenseEntitlement"])
	assert.Contains(t, schemas["LicenseEntitlement"].Properties, "licenseId")
	assert.NotContains(t, schemas["LicenseEntitlement"].Properties, "licenseID")
}

func eachOperation(oapi *huma.OpenAPI, fn func(method, path string, op *huma.Operation)) {
	for path, item := range oapi.Paths {
		for method, op := range map[string]*huma.Operation{
			"GET": item.Get, "POST": item.Post, "PUT": item.Put, "PATCH": item.Patch,
			"DELETE": item.Delete, "HEAD": item.Head, "OPTIONS": item.Options, "TRACE": item.Trace,
		} {
			if op != nil {
				fn(method, path, op)
			}
		}
	}
}

// walkNames visits every schema property name and every non-header
// parameter name in the document. Header names are skipped: they are
// canonical HTTP headers (`If-None-Match`), not part of the naming rule.
func walkNames(node any, visit func(string)) {
	switch n := node.(type) {
	case map[string]any:
		if props, ok := n["properties"].(map[string]any); ok {
			for name := range props {
				visit(name)
			}
		}
		if name, ok := n["name"].(string); ok {
			if in, ok := n["in"].(string); ok && in != "header" {
				visit(name)
			}
		}
		for _, v := range n {
			walkNames(v, visit)
		}
	case []any:
		for _, v := range n {
			walkNames(v, visit)
		}
	}
}
