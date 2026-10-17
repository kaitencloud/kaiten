package huma

import (
	"context"
	"fmt"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// BearerAuth is the name of the Core API's security scheme.
const BearerAuth = "bearerAuth"

// PlatformAuth is the Platform API's security scheme. Deliberately a DIFFERENT
// scheme rather than an extra scope on BearerAuth, so a generated client cannot
// cross the two credential classes by accident: the distinction survives out of
// the OpenAPI document and into every SDK.
const PlatformAuth = "platformAuth"

// PublishableKeyAuth is the public SDK surface's scheme: a publishable key
// (pk_) in the X-Kaiten-Publishable-Key header. A third scheme rather than a
// variant of bearerAuth, for the reason PlatformAuth is one: a generated client
// cannot send the wrong credential class to the wrong surface by accident.
const PublishableKeyAuth = "publishableKey"

// PublicPathPrefix is the public surface's path namespace, relative to the /api
// group. Every operation registered with RegisterPublishable lives under it,
// and nothing else does -- the gateway routes it without authentication and the
// server authenticates it with the publishable key alone.
const PublicPathPrefix = "/public"

// CustomerSessionAuth is the scheme of the session routes of the public SDK
// surface: a customer session (kst_) as a bearer token. A fourth scheme, so a
// generated client cannot send a publishable key or an organization
// credential there by accident.
const CustomerSessionAuth = "customerSession"

// SessionPathPrefix is the session routes' namespace, inside PublicPathPrefix:
// a customer session authenticates them, and nothing else does. Every
// operation registered with RegisterSession lives under it, and only those.
const SessionPathPrefix = PublicPathPrefix + "/session"

// ScopesExtension is the vendor extension under which the Core document's
// security scheme lists every scope an organization credential can carry
// (scope.OrganizationScopes). The operations' own `security:` blocks cannot stand
// in for it: they name only what this API enforces, so a scope enforced by a
// service in front of the same credentials -- the outbound webhooks one -- is
// missing from any token picker built on them. The console's was, until it read
// this.
const ScopesExtension = "x-kaiten-scopes"

// bearerScheme describes how a caller authenticates to the Core API. Every route
// under /api except the token-validation endpoint and the docs is behind
// auth.Middleware, which accepts either a proxy-verified JWT or a Kaiten
// personal access token (`ksh_...`) exchanged for one.
var bearerScheme = &huma.SecurityScheme{
	Type:         "http",
	Scheme:       "bearer",
	BearerFormat: "JWT",
	Description: "A JWT verified by the proxy in front of this API, or a Kaiten access token (`ksh_...`) — " +
		"send either as `Authorization: Bearer <token>`. The scopes listed " +
		"on each operation are the ones the token must carry; " +
		"`write:<module>` implies `read:<module>`, and `read:*` / `write:*` " +
		"are wildcards over every module. `" + ScopesExtension + "` lists every " +
		"scope such a token can carry, including those enforced by a service " +
		"in front of this API rather than by one of its operations.",
	Extensions: map[string]any{ScopesExtension: scope.OrganizationScopes()},
}

// platformScheme describes how a caller authenticates to the Platform API.
var platformScheme = &huma.SecurityScheme{
	Type:         "http",
	Scheme:       "bearer",
	BearerFormat: "Platform token",
	Description: "A Kaiten platform token (`ksm_...`), which authenticates the " +
		"platform identity `system:kaiten` and carries no organization context. " +
		"Organization credentials — JWTs from the configured OIDC issuer and " +
		"`ksh_...` access tokens — are rejected on this surface, and a platform " +
		"token is rejected on the Core API. The scopes listed on each operation " +
		"are the ones the token must carry.",
}

// publishableKeyScheme describes how a web page authenticates to the public
// surface.
var publishableKeyScheme = &huma.SecurityScheme{
	Type: "apiKey",
	In:   "header",
	Name: "X-Kaiten-Publishable-Key",
	Description: "A Kaiten publishable key (`pk_...`). Not a secret: it ships in web pages, " +
		"and authorizes reading the organization's public catalogue and nothing else. " +
		"A browser request must come from one of the key's allowed origins. " +
		"Never send it as `Authorization`; a request carrying `Authorization` is refused.",
}

// customerSessionScheme describes how a vendor's customer authenticates to the
// session routes.
var customerSessionScheme = &huma.SecurityScheme{
	Type:         "http",
	Scheme:       "bearer",
	BearerFormat: "kst_",
	Description: "A customer session (`kst_...`), minted by the vendor's backend with " +
		"POST /customer-sessions and sent as `Authorization: Bearer kst_...`. It acts for one " +
		"customer -- and one of its instances, when bound -- on the /public/session routes and nowhere else. " +
		"A browser request must come from an origin one of the organization's publishable keys allows.",
}

// ConfigureSecurity declares the bearer scheme and makes it the
// document-level default, so a generated client is born authenticated
// instead of every SDK re-inventing the plumbing by hand.
// Per-operation scope requirements are added by RegisterScoped.
func ConfigureSecurity(config huma.Config) huma.Config {
	if config.Components == nil {
		config.Components = &huma.Components{}
	}
	if config.Components.SecuritySchemes == nil {
		config.Components.SecuritySchemes = map[string]*huma.SecurityScheme{}
	}
	config.Components.SecuritySchemes[BearerAuth] = bearerScheme
	config.Components.SecuritySchemes[PublishableKeyAuth] = publishableKeyScheme
	config.Components.SecuritySchemes[CustomerSessionAuth] = customerSessionScheme
	config.Security = []map[string][]string{{BearerAuth: {}}}
	return config
}

// ConfigurePlatformSecurity is ConfigureSecurity for the Platform API document.
// It declares platformScheme and makes it the document-level default, so the
// Platform document never mentions bearerAuth -- the contract-level statement of
// the Core/Platform partition, and what a generated platform client is born with.
// Per-operation scope requirements are added by RegisterPlatform.
func ConfigurePlatformSecurity(config huma.Config) huma.Config {
	if config.Components == nil {
		config.Components = &huma.Components{}
	}
	if config.Components.SecuritySchemes == nil {
		config.Components.SecuritySchemes = map[string]*huma.SecurityScheme{}
	}
	config.Components.SecuritySchemes[PlatformAuth] = platformScheme
	config.Security = []map[string][]string{{PlatformAuth: {}}}
	return config
}

// RegisterScoped registers a Huma operation on the Core API.
//
// It declares two things and enforces neither: that the operation accepts an
// organization credential and nothing else (bearerAuth in `security`), and the
// scope a caller must hold (projected onto that same entry). An integrator
// reads both out of the document rather than out of Go source.
//
// Enforcement happens once, in the facade: the scope is required by the facade
// method the handler calls, and the credential class is settled by the
// caller.Organization that produces its argument. Neither is a fact about HTTP.
//
// Enforcing nothing here is deliberate. A middleware would be a floor under a
// handler that forgets to take a caller -- but such a handler skips the scope
// check too, so it covers half the mistake by restating a rule the facade
// already makes unrepresentable. What covers the whole mistake is
// tests/architecture/entry_point_scope_test.go, which asserts every registered
// operation's handler resolves a caller of the class this registrar declares.
//
// Published and enforced cannot drift: both name the same per-package
// RequiredScope const, and facade_boundary_test.go asserts each direction.
func RegisterScoped[I, O any](
	api huma.API,
	op huma.Operation,
	requiredScope string,
	handler func(context.Context, *I) (*O, error),
) {
	op.Security = append(op.Security, ScopeRequirement(requiredScope))
	huma.Register(api, op, handler)
}

// RegisterPlatform is RegisterScoped for the Platform API: same declaration of a
// credential class and a published scope, but the class is platform and the scheme
// is platformAuth instead of bearerAuth. The class is enforced by the
// caller.Platform each handler resolves, for the reason RegisterScoped states.
//
// Every operation registered through this function must have a path under
// /platform/, and no operation registered through RegisterScoped may -- asserted
// in tests/architecture/entry_point_scope_test.go, which is what makes the two
// surfaces a provable partition rather than a convention.
//
// It panics for a path declaring {orgId}: that operation targets an organization
// and must go through RegisterPlatformForOrganization, which declares the 404 that
// naming a non-existent one produces. Registering it here would publish an
// operation whose contract omits an answer it can give.
func RegisterPlatform[I, O any](
	api huma.API,
	op huma.Operation,
	requiredScope string,
	handler func(context.Context, *I) (*O, error),
) {
	assertTargetOrganizationPath(op)

	// The audit middleware is the only one left, and it decides nothing: it reads
	// the status after the chain returns, so a refusal is recorded wherever it was
	// decided -- the caller.Platform at the top of the handler, or the facade method
	// the handler calls. See its doc comment for why attribution on this surface is a
	// log record rather than an audit_trail row.
	op.Middlewares = append(op.Middlewares, AuditPlatformAction())
	op.Security = append(op.Security, PlatformScopeRequirement(requiredScope))
	huma.Register(api, op, handler)
}

// RegisterPublishable registers an operation of the public SDK surface, read
// with a publishable key.
//
// It takes no scope, and that is the design rather than an omission: a pk_
// carries none, because what bounds it is the route family. Its operations are
// the whole of what a key can reach, so the review gate is this registrar --
// tests/architecture/entry_point_scope_test.go asserts its handlers resolve
// caller.PublishableKey, and that its paths and only its paths are under
// PublicPathPrefix.
//
// It panics for a path outside PublicPathPrefix: the gateway and the server
// authenticate that prefix with the publishable key alone, so an operation
// registered here elsewhere would be reachable with a credential it does not
// declare.
func RegisterPublishable[I, O any](
	api huma.API,
	op huma.Operation,
	handler func(context.Context, *I) (*O, error),
) {
	if !strings.HasPrefix(op.Path, PublicPathPrefix+"/") || strings.HasPrefix(op.Path, SessionPathPrefix+"/") {
		panic(fmt.Sprintf("RegisterPublishable: operation %q has path %q, outside %s/ or inside %s/",
			op.OperationID, op.Path, PublicPathPrefix, SessionPathPrefix))
	}
	op.Security = []map[string][]string{{PublishableKeyAuth: {}}}
	huma.Register(api, op, handler)
}

// RegisterSession registers an operation of the session routes, which a
// customer session authenticates.
//
// It takes no scope, for the reason RegisterPublishable takes none: a session
// carries none, and what bounds it is its customer -- which every handler
// filters on -- and this route family. tests/architecture asserts its handlers
// resolve caller.CustomerSession, and that its paths and only its paths are
// under SessionPathPrefix.
//
// It panics for a path outside SessionPathPrefix: the server authenticates
// that prefix with a session alone, so an operation registered here elsewhere
// would be reached with a credential it does not declare.
func RegisterSession[I, O any](
	api huma.API,
	op huma.Operation,
	handler func(context.Context, *I) (*O, error),
) {
	if !strings.HasPrefix(op.Path, SessionPathPrefix+"/") {
		panic(fmt.Sprintf("RegisterSession: operation %q has path %q, outside %s/", op.OperationID, op.Path, SessionPathPrefix))
	}
	op.Security = []map[string][]string{{CustomerSessionAuth: {}}}
	huma.Register(api, op, handler)
}

// ScopeRequirement is the operation-level `security` entry for a scope. It
// exists for the two OFREP endpoints, which are Fiber routes whose
// huma.Operation is written by hand and so cannot go through
// RegisterScoped.
func ScopeRequirement(scopes ...string) map[string][]string {
	return map[string][]string{BearerAuth: scopes}
}

// PlatformScopeRequirement is ScopeRequirement for the Platform API. It names a
// different scheme, which is the whole point: an operation cannot accidentally
// publish a platform scope requirement under the Core API's credential.
func PlatformScopeRequirement(scopes ...string) map[string][]string {
	return map[string][]string{PlatformAuth: scopes}
}
