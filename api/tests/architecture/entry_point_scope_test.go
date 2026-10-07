// Every HTTP entry point this service exposes must be routed through something
// that enforces a scope, and a new one cannot be added without either being so
// routed or being recorded here as deliberately public.
package architecture_test

import (
	"fmt"
	"go/ast"
	"go/constant"
	"go/types"
	"sort"
	"strings"
	"sync"
	"testing"

	"golang.org/x/tools/go/packages"

	kaitengraphql "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql"
)

// allPackagesPattern loads every production package in this module: an entry
// point can be registered from anywhere, so a narrower walk leaves a hole
// exactly where nobody is looking.
const allPackagesPattern = "github.com/kaitencloud/kaiten/api/..."

// The packages whose functions define what "an entry point" means here. The
// OFREP routes are covered by facadeEnforcedFiberRoutes below.
const (
	humaPkg       = "github.com/danielgtaylor/huma/v2"
	fiberPkg      = "github.com/gofiber/fiber/v3"
	kaitenHumaPkg = "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	generatedPkg  = "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/generated"
)

// The published surface is 100 operations: 93 in app/openapi.yaml and 7 in
// app/platform-openapi.yaml. Counted three ways, because the walks in this
// directory do not all measure the same thing:
const (
	// minRegistrarCallSites floors the two walks that count registration calls:
	// 98 today.
	minRegistrarCallSites = 90
	// minOperationLiterals floors the walk that counts huma.Operation composite
	// literals wherever they are written: 101 today.
	minOperationLiterals = 90
)

// platformPathPrefix is the Platform API's path namespace, relative to the /api
// group the two Huma APIs share. Operation paths are what keep the two surfaces
// disjoint — they are mounted on the same Fiber group, so there is no router-level
// separation to fall back on.
const platformPathPrefix = "/platform"

// publicPathPrefix is the public SDK surface's namespace, authenticated by a
// publishable key alone. Kept in step with kaitenhuma.PublicPathPrefix.
const publicPathPrefix = "/public"

var (
	loadOnce sync.Once
	loadPkgs []*packages.Package
	loadErr  error
)

// loadModule type-checks the whole module once and shares the result across
// the tests in this file. Tests: false scopes it to production source —
// a route registered inside a _test.go file is a fixture, not an entry point.
func loadModule(t *testing.T) []*packages.Package {
	t.Helper()

	loadOnce.Do(func() {
		cfg := &packages.Config{
			Mode: packages.NeedName |
				packages.NeedFiles |
				packages.NeedCompiledGoFiles |
				packages.NeedImports |
				packages.NeedTypes |
				packages.NeedTypesInfo |
				packages.NeedSyntax,
			Tests: false,
		}

		pkgs, err := packages.Load(cfg, allPackagesPattern)
		if err != nil {
			loadErr = fmt.Errorf("packages.Load(%q): %w", allPackagesPattern, err)
			return
		}
		if len(pkgs) == 0 {
			loadErr = fmt.Errorf("packages.Load(%q) returned no packages -- pattern is likely wrong", allPackagesPattern)
			return
		}

		var problems []string
		packages.Visit(pkgs, nil, func(pkg *packages.Package) {
			for _, e := range pkg.Errors {
				problems = append(problems, fmt.Sprintf("%s: %s", pkg.PkgPath, e))
			}
		})
		if len(problems) > 0 {
			sort.Strings(problems)
			loadErr = fmt.Errorf("errors loading/type-checking %s (fix the build before this fitness function can run):\n%s",
				allPackagesPattern, strings.Join(problems, "\n"))
			return
		}

		loadPkgs = pkgs
	})

	if loadErr != nil {
		t.Fatalf("%v", loadErr)
	}
	return loadPkgs
}

// callee resolves a call expression to the package path and name of the
// function it invokes, for both plain calls (huma.Register(...)) and
// explicitly instantiated generic ones (huma.Register[I, O](...)). Returns
// two empty strings when the callee is not a package-level function — a
// method value, a func-typed field, a local closure.
func callee(info *types.Info, call *ast.CallExpr) (pkgPath, name string) {
	fun := ast.Unparen(call.Fun)

	// Peel an explicit type-argument list: f[T](x) and f[T1, T2](x).
	switch idx := fun.(type) {
	case *ast.IndexExpr:
		fun = ast.Unparen(idx.X)
	case *ast.IndexListExpr:
		fun = ast.Unparen(idx.X)
	}

	var ident *ast.Ident
	switch f := fun.(type) {
	case *ast.SelectorExpr:
		ident = f.Sel
	case *ast.Ident:
		ident = f
	default:
		return "", ""
	}

	obj := info.Uses[ident]
	if obj == nil || obj.Pkg() == nil {
		return "", ""
	}
	return obj.Pkg().Path(), obj.Name()
}

// stringConstant returns the compile-time string value of an expression, and
// whether it had one. Route paths are written both as literals
// (router.Get("/tokens/validate", ...)) and as named constants
// (daprGroup.Post(cdc.Route, ...)), and go/types has already folded
// both into the same place.
func stringConstant(info *types.Info, expr ast.Expr) (string, bool) {
	tv, ok := info.Types[expr]
	if !ok || tv.Value == nil || tv.Value.Kind() != constant.String {
		return "", false
	}
	return constant.StringVal(tv.Value), true
}

// operationStringField digs a string-valued field out of a huma.Operation
// literal. Returns false when the literal omits the field, the value is not a
// compile-time string, or the argument is not a literal at all.
func operationStringField(info *types.Info, arg ast.Expr, field string) (string, bool) {
	lit, ok := ast.Unparen(arg).(*ast.CompositeLit)
	if !ok {
		return "", false
	}
	for _, elt := range lit.Elts {
		kv, ok := elt.(*ast.KeyValueExpr)
		if !ok {
			continue
		}
		key, ok := kv.Key.(*ast.Ident)
		if !ok || key.Name != field {
			continue
		}
		return stringConstant(info, kv.Value)
	}
	return "", false
}

// operationID digs the OperationID out of a huma.Operation literal so a
// failure names the endpoint the way the contract does, not just a file
// offset. Returns "" when the literal omits it or the argument is not a
// literal at all.
func operationID(info *types.Info, arg ast.Expr) string {
	id, _ := operationStringField(info, arg, "OperationID")
	return id
}

// TestEveryHumaOperationDeclaresAScope fails when an operation is registered
// anywhere but through a kaitenhuma registrar.
func TestEveryHumaOperationDeclaresAScope(t *testing.T) {
	pkgs := loadModule(t)

	var (
		unguarded []string
		seen      int
	)

	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		// The kaitenhuma package is the registration plumbing itself, not a
		// place endpoints live: the three registrars each end in a
		// huma.Register call, which is the one legitimate use of it.
		if pkg.PkgPath == kaitenHumaPkg {
			return
		}

		for _, file := range pkg.Syntax {
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}

				pkgPath, name := callee(pkg.TypesInfo, call)

				// RegisterScoped (B4), RegisterPlatform and
				// RegisterPlatformForOrganization all take the scope as a
				// parameter, so none of them can be called without one. Count
				// and move on.
				if pkgPath == kaitenHumaPkg && registrarOperationArg[name] > 0 {
					seen++
					return true
				}

				if pkgPath != humaPkg || name != "Register" {
					return true
				}
				seen++

				pos := pkg.Fset.Position(call.Pos())
				id := "<no OperationID>"
				if len(call.Args) >= 2 {
					if got := operationID(pkg.TypesInfo, call.Args[1]); got != "" {
						id = got
					}
				}

				unguarded = append(unguarded, fmt.Sprintf(
					"%s: operation %q calls huma.Register directly -- it would publish no scope in the "+
						"OpenAPI document and declare no credential class; register it with "+
						"kaitenhuma.RegisterScoped, RegisterPlatform or RegisterPlatformForOrganization, "+
						"which take the scope as a parameter",
					pos, id,
				))
				return true
			})
		}
	})

	if len(unguarded) > 0 {
		sort.Strings(unguarded)
		t.Errorf("found %d Huma operation(s) registered outside a registrar:\n%s",
			len(unguarded), strings.Join(unguarded, "\n"))
	}

	if seen < minRegistrarCallSites {
		t.Errorf("only found %d registered Huma operation(s), expected at least %d -- "+
			"this test walks the AST for huma.Register/kaitenhuma.RegisterScoped, so a count this low almost certainly means the walk stopped matching rather than that endpoints were deleted; fix the walk before trusting a pass here",
			seen, minRegistrarCallSites)
	}
}

// registrarOperationArg maps each kaitenhuma registrar to the argument index of
// its huma.Operation. A map rather than a constant because the index is a
// property of each registrar's signature, and assuming a shared one reads the
// wrong argument.
//
// It doubles as the registrar registry: a registrar not listed here is invisible
// to both walks, so TestCoreAndPlatformRegistrarsPartitionThePaths asserts every
// name in it still exists.
var registrarOperationArg = map[string]int{
	"RegisterScoped":                  1,
	"RegisterPlatform":                1,
	"RegisterPlatformForOrganization": 1,
	"RegisterPublishable":             1,
}

// scopelessRegistrars are the registrars that take no scope, and why. A
// publishable key carries none: what bounds it is its route family, which this
// file pins by path (TestCoreAndPlatformRegistrarsPartitionThePaths) and by
// caller class (TestEveryRegisteredOperationResolvesItsCaller). Listed so the
// scope walks in facade_boundary_test.go skip it by name rather than by
// tolerating a missing argument.
var scopelessRegistrars = map[string]string{
	"RegisterPublishable": "a pk_ authorizes the /public routes by being one; it carries no scope",
}

// registrarPathNamespace is the path namespace each registrar's operations
// must live in, and the only registrar allowed there. "" is the Core surface:
// anything under neither prefix.
var registrarPathNamespace = map[string]string{
	"RegisterScoped":                  "",
	"RegisterPlatform":                platformPathPrefix,
	"RegisterPlatformForOrganization": platformPathPrefix,
	"RegisterPublishable":             publicPathPrefix,
}

// Fails when an operation is registered with the wrong registrar for the path it
// is mounted on.
//
// Credential class is a property of the operation, declared by the registrar.
// Both Huma APIs mount on the same /api Fiber group, so nothing at the router
// level stops a platform operation being registered as a Core one, or a Core
// operation being reachable under /api/platform. Path and registrar agreeing is
// what makes the two surfaces a partition an integrator can read off the URL.
//
// Not a count: a registrar with no call sites yet is legitimate. The
// vacuous-pass risk is covered directly, by asserting both registrars exist.
func TestCoreAndPlatformRegistrarsPartitionThePaths(t *testing.T) {
	pkgs := loadModule(t)

	var kaitenHuma *packages.Package
	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		if pkg.PkgPath == kaitenHumaPkg {
			kaitenHuma = pkg
		}
	})
	if kaitenHuma == nil || kaitenHuma.Types == nil {
		t.Fatalf("package %q not found in the loaded module -- has the registration plumbing moved?", kaitenHumaPkg)
	}
	for registrar := range registrarOperationArg {
		if kaitenHuma.Types.Scope().Lookup(registrar) == nil {
			t.Fatalf("%s.%s no longer exists -- this test walks for it by name, so it would pass vacuously; update the walk",
				kaitenHumaPkg, registrar)
		}
	}

	var violations []string

	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		// The plumbing package registers nothing itself.
		if pkg.PkgPath == kaitenHumaPkg {
			return
		}

		for _, file := range pkg.Syntax {
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}

				pkgPath, name := callee(pkg.TypesInfo, call)
				if pkgPath != kaitenHumaPkg {
					return true
				}

				opArg, isRegistrar := registrarOperationArg[name]
				if !isRegistrar {
					return true
				}
				wantNamespace := registrarPathNamespace[name]

				// Register*(api, operation, ...).
				if len(call.Args) <= opArg {
					return true
				}
				pos := pkg.Fset.Position(call.Pos())

				path, ok := operationStringField(pkg.TypesInfo, call.Args[opArg], "Path")
				if !ok {
					violations = append(violations, fmt.Sprintf(
						"%s: %s is passed an operation whose Path is not a compile-time string, so the surface partition cannot be reviewed statically -- inline the huma.Operation literal with a literal or constant Path",
						pos, name,
					))
					return true
				}

				gotNamespace := ""
				for _, prefix := range []string{platformPathPrefix, publicPathPrefix} {
					if path == prefix || strings.HasPrefix(path, prefix+"/") {
						gotNamespace = prefix
					}
				}

				id := operationID(pkg.TypesInfo, call.Args[opArg])
				if id == "" {
					id = "<no OperationID>"
				}

				if gotNamespace != wantNamespace {
					violations = append(violations, fmt.Sprintf(
						"%s: operation %q is registered with %s, whose operations live under %q, but its path %q is under %q -- "+
							"each credential class owns its namespace (Core: neither /platform nor /public; Platform: /platform; publishable key: /public), "+
							"so an operation outside its own would accept a credential its URL does not announce; move the path or change the registrar",
						pos, id, name, displayNamespace(wantNamespace), path, displayNamespace(gotNamespace),
					))
				}
				return true
			})
		}
	})

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d registrar/path mismatch(es):\n%s", len(violations), strings.Join(violations, "\n"))
	}
}

// callerConstructorForRegistrar maps each registrar to the caller.<name>
// constructor its operations' handlers must call. With no middleware stating it,
// this is the declaration of which credential class each surface accepts.
//
// TestEveryRegisteredOperationResolvesItsCaller asserts it agrees with
// registrarOperationArg: a registrar in one map and not the other is a surface
// with no credential class at all.
var callerConstructorForRegistrar = map[string]string{
	"RegisterScoped":                  "Organization",
	"RegisterPlatform":                "Platform",
	"RegisterPlatformForOrganization": "Platform",
	"RegisterPublishable":             "PublishableKey",
}

// Fails when a registered operation's handler does not open by resolving a
// caller of the class its registrar declares.
//
// Source-level where a runtime check would be weaker: a middleware would answer
// for the whole surface including an operation whose handler takes no caller at
// all -- and such a handler reaches no facade method either, so it skips the
// scope check too. caller.Organization and caller.Platform refuse a principal of
// the wrong or unassigned kind, so the handler's first line carries both facts.
//
// It asserts the CLASS as well as the presence: a platform operation whose
// handler resolves caller.Organization compiles, fails closed for the wrong
// reason, and reads as correct in review.
//
// A handler this walk cannot follow is reported rather than skipped -- an
// unreadable handler is where an unguarded one would hide.
func TestEveryRegisteredOperationResolvesItsCaller(t *testing.T) {
	pkgs := loadModule(t)

	for registrar := range registrarOperationArg {
		if _, ok := callerConstructorForRegistrar[registrar]; !ok {
			t.Fatalf("registrar %q has no entry in callerConstructorForRegistrar -- every surface "+
				"must declare which caller class its handlers resolve, or this walk skips it silently",
				registrar)
		}
	}

	var (
		violations []string
		seen       int
	)

	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		if pkg.PkgPath == kaitenHumaPkg || pkg.TypesInfo == nil {
			return
		}

		for _, file := range pkg.Syntax {
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}

				pkgPath, name := callee(pkg.TypesInfo, call)
				if pkgPath != kaitenHumaPkg {
					return true
				}
				opArg, isRegistrar := registrarOperationArg[name]
				if !isRegistrar {
					return true
				}

				// Register*(api, operation, scope, handler): the handler is last.
				handlerArg := opArg + 2
				if len(call.Args) <= handlerArg {
					return true
				}
				seen++

				pos := pkg.Fset.Position(call.Pos())
				id := operationID(pkg.TypesInfo, call.Args[opArg])
				if id == "" {
					id = "<no OperationID>"
				}
				want := callerConstructorForRegistrar[name]

				body, ok := handlerBody(pkg, call.Args[handlerArg])
				if !ok {
					violations = append(violations, fmt.Sprintf(
						"%s: operation %q is registered with a handler this walk cannot follow to a "+
							"function body, so nothing proves it resolves a caller -- pass a function "+
							"literal or a function declared in the same package",
						pos, id))
					return true
				}

				resolved := callerConstructorsCalled(pkg.TypesInfo, body)
				switch {
				case len(resolved) == 0:
					violations = append(violations, fmt.Sprintf(
						"%s: operation %q resolves no caller -- caller.%s is what refuses a credential of "+
							"the wrong class now that no middleware does, and a handler without one reaches "+
							"no facade method, so its scope goes unenforced too",
						pos, id, want))
				case !resolved[want]:
					violations = append(violations, fmt.Sprintf(
						"%s: operation %q is registered with %s but its handler resolves caller.%s -- the "+
							"registrar and the constructor are the two halves of one declaration and they "+
							"disagree; this fails closed at runtime for the wrong reason",
						pos, id, name, strings.Join(sortedKeys(resolved), "/")))
				}
				return true
			})
		}
	})

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d registered operation(s) that do not resolve their caller:\n%s",
			len(violations), strings.Join(violations, "\n"))
	}

	if seen < minRegistrarCallSites {
		t.Errorf("only inspected %d registered operation(s), expected at least %d -- this walk resolves "+
			"registrar calls through go/types, so a count this low means it stopped matching rather "+
			"than that endpoints were deleted; fix the walk before trusting a pass here",
			seen, minRegistrarCallSites)
	}
}

// handlerBody returns the body of the handler passed to a registrar, following a
// named function to its declaration. Reports false when the expression is neither --
// a method value, a func-typed field, a handler built by a helper -- because such a
// handler cannot be reviewed here and must not be assumed innocent.
func handlerBody(pkg *packages.Package, expr ast.Expr) (*ast.BlockStmt, bool) {
	switch handler := ast.Unparen(expr).(type) {
	case *ast.FuncLit:
		return handler.Body, true
	case *ast.Ident:
		decl, ok := pkg.TypesInfo.Uses[handler].(*types.Func)
		if !ok {
			return nil, false
		}
		return funcDeclBody(pkg, decl)
	}
	return nil, false
}

// funcDeclBody finds the declaration of fn in pkg and returns its body.
func funcDeclBody(pkg *packages.Package, fn *types.Func) (*ast.BlockStmt, bool) {
	for _, file := range pkg.Syntax {
		for _, decl := range file.Decls {
			candidate, ok := decl.(*ast.FuncDecl)
			if !ok || candidate.Body == nil {
				continue
			}
			if pkg.TypesInfo.Defs[candidate.Name] == fn {
				return candidate.Body, true
			}
		}
	}
	return nil, false
}

// callerConstructorsCalled reports which caller constructors a handler body calls,
// as a set of bare names ("Organization", "Platform"). Nested function literals are
// walked too: a handler that resolves its caller inside a closure it runs is still
// resolving it, and refusing to see that would push call sites into a shape the rule
// did not intend.
func callerConstructorsCalled(info *types.Info, body *ast.BlockStmt) map[string]bool {
	found := map[string]bool{}

	ast.Inspect(body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		pkgPath, name := callee(info, call)
		if pkgPath != callerPkg {
			return true
		}
		if _, isConstructor := callerConstructorNames[name]; isConstructor {
			found[name] = true
		}
		return true
	})

	return found
}

// callerConstructorNames is the set of constructors that establish a credential
// class from a request. InProcess is deliberately absent: it takes no context and
// establishes nothing, and an operation reaching for it is the leak
// inprocess_isolation_test.go exists to catch, not a way to satisfy this test.
var callerConstructorNames = map[string]struct{}{
	"Organization":   {},
	"Platform":       {},
	"PublishableKey": {},
}

// publicFiberRoutes records the Fiber routes reachable with no authorization at
// all, and why. The review gate: a route in none of this map,
// facadeEnforcedFiberRoutes and gateEnforcedFiberRoutes fails the test, so making
// an entry point public is an explicit edit here rather than an omission nobody
// sees.
//
// Keys are "<METHOD> <path>", the path as written at the registration site,
// relative to the group it is mounted on (/api or /dapr).
var publicFiberRoutes = map[string]string{
	// internal/infrastructure/http/server/server.go — mounted on the raw
	// router rather than the /api group, so they never enter the auth
	// pipeline. Liveness and readiness must answer before an identity exists.
	"GET /api/healthz": "liveness probe, no identity by definition",
	"GET /api/readyz":  "readiness probe, no identity by definition",

	// The API reference page. Public on the same terms as the two OpenAPI
	// documents it links to: a reference behind a credential documents nothing to
	// anyone who does not already have one. It reads no request state.
	"GET /docs": "the API reference page, public on the same terms as the OpenAPI documents it links to",

	// internal/infrastructure/http/graphql/handler.go — the playground is a static
	// page, gated on config, not on a scope. The route it sends its documents to
	// is in gateEnforcedFiberRoutes.
	"GET /graphql/playground": "developer playground, gated on EnablePlayground config rather than a scope",

	// This route *is* the authentication step: ext_authz calls it to exchange a
	// `ksh_` for the internal JWT every other route requires, so a scope here
	// would be circular. One entry, not two -- the proxy rewrites every check
	// request to this exact path.
	"ALL /tokens/validate": "the token-exchange endpoint itself; requiring a scope would be circular",

	// The /dapr group is created before any auth middleware, so sidecar traffic
	// never enters the identity pipeline. One route for the whole CDC stream
	// whatever the number of in-process consumers: Dapr delivers to an app-id
	// once, so a second route is a second subscription and a second copy of every
	// message. No scope, because there is no caller to hold one -- kaiten.Events
	// resolves the acting identity from the organization the message names.
	"POST /cdc/events": "Dapr pub/sub delivery, on the /dapr group which is outside the auth pipeline",
	// The dead-letter topic's own subscription, and it has to be one: a
	// dead-letter topic nobody subscribes to is a queue that grows forever and is
	// read by no one, which is the same lost message with a bill attached. Same
	// reasoning as the line above -- the sidecar is the only caller, it holds no
	// identity, and this handler resolves none: it logs and acknowledges.
	"POST /cdc/dead-letter": "Dapr pub/sub delivery, on the /dapr group which is outside the auth pipeline",
	"GET /subscribe":        "Dapr subscription discovery, on the /dapr group which is outside the auth pipeline",
}

// facadeEnforcedFiberRoutes records the Fiber routes authorized one call deeper:
// the handler resolves a caller and the facade method requires the scope. Nothing
// is visible on the route line, which is why they must be listed -- an
// unauthorized route and one authorized deeper read identically here.
//
// What is still checkable is the artifact both halves share: the registering
// package must declare a RequiredScope, the same const the hand-written
// huma.Operation publishes and the facade method requires.
//
// Keys are "<METHOD> <path>", as in publicFiberRoutes.
var facadeEnforcedFiberRoutes = map[string]string{
	// internal/modules/featureflags/openfeature/ofrep/{bulkevaluateflags,evaluateflag}
	// — the OFREP evaluation endpoints. They are Fiber routes rather than huma
	// operations because huma cannot express OFREP's error content negotiation, so
	// they have no registrar to declare a scope for them; they are the only two
	// published operations in the service that do not.
	"POST /ofrep/v1/evaluate/flags":      "OFREP bulk evaluation; scope enforced by Kaiten.FeatureFlags.EvaluateAll",
	"POST /ofrep/v1/evaluate/flags/:key": "OFREP single evaluation; scope enforced by Kaiten.FeatureFlags.Evaluate",

	// internal/modules/notifications/stream — the SSE feed. A Fiber route
	// because it is an open connection writing frames for as long as a tab is
	// open, which huma has no way to describe; authorization is the same
	// read:notifications every other read of the feed requires.
	"GET /v1/notifications/stream": "notification stream; scope enforced by Kaiten.Notifications.OpenStream",
}

// requiredScopeConst is the per-use-case scope declaration every published
// operation has, named here because facadeEnforcedFiberRoutes is checked against
// it by name and a rename would otherwise make that check pass vacuously.
const requiredScopeConst = "RequiredScope"

// gateEnforcedFiberRoutes records the Fiber route whose scope is not one constant,
// because what a request requires depends on the document it carries: /graphql
// requires, for each field an operation selects, the scope of the type that field
// returns. So there is no RequiredScope to tie it to.
//
// What is checkable instead is that the package registering the route still
// installs the gate on the server it builds -- see installsScopeGate. That the gate
// then refuses is the graphql package's own tests' to prove, and which scope each
// entry point costs is pinned below, in pinnedGraphQLResolvers.
//
// Keys are "<METHOD> <path>", as in publicFiberRoutes.
var gateEnforcedFiberRoutes = map[string]string{
	"ALL /graphql": "scopes required per selected field, before anything is resolved, by the graphql package's scopeGate",
}

// scopeGateType is the gqlgen extension that requires those scopes, and
// gqlgenHandlerPkg the package whose Server.Use installs an extension. Both are
// named here for the reason requiredScopeConst is.
const (
	scopeGateType    = "scopeGate"
	gqlgenHandlerPkg = "github.com/99designs/gqlgen/graphql/handler"
)

// installsScopeGate reports whether pkg hands a scopeGate of its own to a gqlgen
// server. Declaring the type is not enough: a gate nobody installed refuses
// nothing, and the route would read as enforced all the same.
func installsScopeGate(pkg *packages.Package) bool {
	if pkg.Types == nil || pkg.TypesInfo == nil {
		return false
	}
	gate, ok := pkg.Types.Scope().Lookup(scopeGateType).(*types.TypeName)
	if !ok {
		return false
	}

	installed := false
	for _, file := range pkg.Syntax {
		ast.Inspect(file, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok || len(call.Args) != 1 {
				return true
			}
			sel, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
			if !ok || sel.Sel.Name != "Use" {
				return true
			}
			selection := pkg.TypesInfo.Selections[sel]
			if selection == nil || selection.Obj().Pkg() == nil || selection.Obj().Pkg().Path() != gqlgenHandlerPkg {
				return true
			}
			if named, ok := pkg.TypesInfo.TypeOf(call.Args[0]).(*types.Named); ok && named.Obj() == gate {
				installed = true
			}
			return true
		})
	}

	return installed
}

// fiberRouteMethods are the fiber.Router methods that mount a route. The whole
// verb set, not just the ones in use, so an unused verb does not silently escape
// the check. Absent on purpose: Use (middleware), and Group/Route/RouteChain/
// Domain/Name, which return a sub-router whose children are visited on their own
// registration lines.
var fiberRouteMethods = map[string]string{
	"Get":     "GET",
	"Head":    "HEAD",
	"Post":    "POST",
	"Put":     "PUT",
	"Delete":  "DELETE",
	"Connect": "CONNECT",
	"Options": "OPTIONS",
	"Trace":   "TRACE",
	"Patch":   "PATCH",
	"Query":   "QUERY",
	"All":     "ALL",
	// Add takes its verbs as a []string first argument. Nothing uses it
	// today; if something does, it is reported (and keyed in
	// publicFiberRoutes) as "ADD <path>" rather than one entry per verb,
	// because the guarantee is per route, not per verb.
	"Add": "ADD",
}

// isFiberRouterMethod reports whether a resolved method mounts a route.
//
// Name and declaring package are not enough: fiber.Ctx has its own Get, so
// `c.Get("Authorization")` would be reported as an unguarded route on a path
// called "Authorization". Every fiber.Router method returns fiber.Router, for
// chaining, and no lookalike does -- so the result type is the discriminator.
func isFiberRouterMethod(obj types.Object) bool {
	fn, ok := obj.(*types.Func)
	if !ok || fn.Pkg() == nil || fn.Pkg().Path() != fiberPkg {
		return false
	}
	sig, ok := fn.Type().(*types.Signature)
	if !ok || sig.Results().Len() != 1 {
		return false
	}
	named, ok := sig.Results().At(0).Type().(*types.Named)
	if !ok || named.Obj().Pkg() == nil {
		return false
	}
	return named.Obj().Pkg().Path() == fiberPkg && named.Obj().Name() == "Router"
}

// Covers the entry points the OpenAPI document cannot see. Every Fiber route
// must appear in exactly one of the three maps, and each is checked for stale
// entries so none outlives the routes it describes.
//
// A review gate rather than a detector: with authorization one call deeper than
// the route line, no AST walk here can tell an authorized route from an
// unauthorized one.
//
// Huma operations are registered through humafiber and are not Fiber method
// calls in this module's source, so they do not appear here.
func TestEveryFiberRouteIsAuthorizedOrDeclaredPublic(t *testing.T) {
	pkgs := loadModule(t)

	var (
		violations []string
		found      = map[string]bool{}
	)

	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		for _, file := range pkg.Syntax {
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				sel, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
				if !ok {
					return true
				}
				method, ok := fiberRouteMethods[sel.Sel.Name]
				if !ok {
					return true
				}
				// Only fiber.Router's own route methods count -- this rejects
				// every same-named method on some other type (time.Add,
				// sync.WaitGroup.Add, fiber.Ctx.Get, ...).
				selection := pkg.TypesInfo.Selections[sel]
				if selection == nil || !isFiberRouterMethod(selection.Obj()) {
					return true
				}

				pos := pkg.Fset.Position(call.Pos())

				// The path is the first argument with a constant string
				// value. For Add the first argument is a []string of methods,
				// which has no constant value, so this still lands on the path.
				path := ""
				for _, arg := range call.Args {
					if s, ok := stringConstant(pkg.TypesInfo, arg); ok {
						path = s
						break
					}
				}
				if path == "" {
					violations = append(violations, fmt.Sprintf(
						"%s: fiber route registered with a non-constant path, which this test cannot review -- use a string literal or an exported constant",
						pos,
					))
					return true
				}

				key := method + " " + path
				found[key] = true

				if _, declared := publicFiberRoutes[key]; declared {
					return true
				}

				if _, enforced := facadeEnforcedFiberRoutes[key]; enforced {
					// The package registering the route must still declare the
					// scope both the document and the facade name. Without it
					// there is nothing tying the two halves together and this
					// entry would be an unchecked assertion.
					if pkg.Types == nil || pkg.Types.Scope().Lookup(requiredScopeConst) == nil {
						violations = append(violations, fmt.Sprintf(
							"%s: fiber route %q is listed in facadeEnforcedFiberRoutes but package %s declares no %s -- "+
								"the facade method has no const to require and the hand-written huma.Operation has none to publish",
							pos, key, shortPkg(pkg.PkgPath), requiredScopeConst,
						))
					}
					return true
				}

				if _, gated := gateEnforcedFiberRoutes[key]; gated {
					if !installsScopeGate(pkg) {
						violations = append(violations, fmt.Sprintf(
							"%s: fiber route %q is listed in gateEnforcedFiberRoutes but package %s hands no %s to a "+
								"gqlgen server -- nothing then requires a scope of the documents this route executes",
							pos, key, shortPkg(pkg.PkgPath), scopeGateType,
						))
					}
					return true
				}

				violations = append(violations, fmt.Sprintf(
					"%s: fiber route %q is neither declared public nor recorded as facade-enforced -- "+
						"authorization is not visible at a route line any more, so add it to "+
						"facadeEnforcedFiberRoutes naming the facade method that requires its scope, or, "+
						"if it is genuinely public, to publicFiberRoutes; both need the reason written down",
					pos, key,
				))
				return true
			})
		}
	})

	// A stale entry in any of the maps is an assertion about a route that no
	// longer exists. Report them so the lists shrink as routes move or disappear.
	for key := range publicFiberRoutes {
		if !found[key] {
			violations = append(violations, fmt.Sprintf(
				"publicFiberRoutes declares %q public, but no such route is registered any more -- delete the entry",
				key,
			))
		}
	}
	for key := range facadeEnforcedFiberRoutes {
		if !found[key] {
			violations = append(violations, fmt.Sprintf(
				"facadeEnforcedFiberRoutes claims %q is enforced by the facade, but no such route is registered any more -- delete the entry",
				key,
			))
		}
	}
	for key := range gateEnforcedFiberRoutes {
		if !found[key] {
			violations = append(violations, fmt.Sprintf(
				"gateEnforcedFiberRoutes claims %q is enforced by the scope gate, but no such route is registered any more -- delete the entry",
				key,
			))
		}
	}

	// Exactly one: the walk above stops at the first map a route is in, so a route
	// declared public as well as enforced would be read as public and its
	// enforcement never looked at.
	for key := range publicFiberRoutes {
		_, facade := facadeEnforcedFiberRoutes[key]
		_, gate := gateEnforcedFiberRoutes[key]
		if facade || gate {
			violations = append(violations, fmt.Sprintf(
				"%q is declared public and recorded as enforced at once -- it is one or the other", key,
			))
		}
	}
	for key := range facadeEnforcedFiberRoutes {
		if _, gate := gateEnforcedFiberRoutes[key]; gate {
			violations = append(violations, fmt.Sprintf(
				"%q is in both facadeEnforcedFiberRoutes and gateEnforcedFiberRoutes -- it is one or the other", key,
			))
		}
	}

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d fiber route problem(s):\n%s", len(violations), strings.Join(violations, "\n"))
	}
}

// pinnedGraphQLResolvers is the reviewed inventory of GraphQL resolver entry
// points, as "<Type>.<Field>", each with the scope a caller must hold to select
// it -- or none, and then the comment beside it says why none is right.
//
// The inventory is derived from the gqlgen-generated resolver interfaces, so it
// tracks schema.graphqls rather than the hand-written resolver files. The scopes
// are written out, not computed: the scope gate derives what a field requires
// from the type it returns (the graphql package's typeScopes), and this is where
// somebody confirms the derivation says what they meant. A resolver returning a
// scalar is the case that needs it most -- no type asks for a scope there, so
// whether it reads anything beyond the value it sits on is decided here or
// nowhere.
//
// Two things hold of the whole list. The surface is read-only: there is no
// Mutation or Subscription resolver, and the gate refuses to be installed on a
// schema that has one. And tenant isolation on these paths comes from the
// repository queries underneath, not from this layer.
var pinnedGraphQLResolvers = map[string]string{
	// The entry's own payload column, decoded.
	"AuditTrail.Payload": "",
	"Customer.Instances": "read:instances",
	// The customer's own integration records, which GET /customers returns
	// inside the customer.
	"Customer.Integrations": "",
	// The usage row's own value and the limit it is measured against.
	"EntitlementUsage.Limit":    "",
	"EntitlementUsage.Value":    "",
	"Instance.AuditTrails":      "read:instances",
	"Instance.Customer":         "read:customers",
	"Instance.DeploymentZone":   "read:deployment_zones",
	"Instance.EntitlementUsage": "read:instances",
	// The instance's own integration records, which GET /instances returns
	// inside the instance.
	"Instance.Integrations":          "",
	"Instance.License":               "read:licenses",
	"License.Entitlements":           "read:licenses",
	"License.Family":                 "read:licenses",
	"License.Instances":              "read:instances",
	"LicenseEntitlement.Entitlement": "read:entitlements",
	// The grant's own value, and whether that value is the unlimited sentinel.
	"LicenseEntitlement.Unlimited": "",
	"LicenseEntitlement.Value":     "",
	"LicenseFamilyView.Versions":   "read:licenses",
	"Query.AuditTrails":            "read:instances",
	"Query.Component":              "read:components",
	"Query.Components":             "read:components",
	"Query.Customer":               "read:customers",
	"Query.Customers":              "read:customers",
	"Query.DeploymentZone":         "read:deployment_zones",
	"Query.DeploymentZones":        "read:deployment_zones",
	"Query.Entitlements":           "read:entitlements",
	// Answers a constant and reads nothing.
	"Query.Health":         "",
	"Query.Instance":       "read:instances",
	"Query.Instances":      "read:instances",
	"Query.License":        "read:licenses",
	"Query.LicenseFamily":  "read:licenses",
	"Query.Licenses":       "read:licenses",
	"Query.MetadataFields": "read:metadata_fields",
	// The whole journal of the organization, payloads included: this one scope
	// reads what every event says about the resource it concerns, whichever
	// module that resource belongs to.
	"Query.OrganizationAuditTrails": "read:organizations",
	"Query.Release":                 "read:releases",
	"Query.Releases":                "read:releases",
	"Release.Components":            "read:components",
	"Release.Deployments":           "read:deployment_zones",
	"Release.DeploymentZones":       "read:deployment_zones",
	"Release.Instances":             "read:instances",
}

// Fails when the set of GraphQL resolver entry points, or the scope the gate
// requires for one of them, differs from pinnedGraphQLResolvers.
//
// The entry points are read through go/types rather than by parsing
// schema.graphqls, so this sees what the runtime dispatches to. ResolverRoot is
// excluded: its methods return the other resolvers and resolve no field. The
// scopes are read from the gate itself, so a resolver cannot be pinned to a scope
// nothing enforces.
func TestGraphQLResolverSurfaceIsPinned(t *testing.T) {
	pkgs := loadModule(t)

	var generated *packages.Package
	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		if pkg.PkgPath == generatedPkg {
			generated = pkg
		}
	})
	if generated == nil || generated.Types == nil {
		t.Fatalf("package %q not found in the loaded module -- has the GraphQL layer moved?", generatedPkg)
	}

	// The gate names fields the way the schema does and the generated interfaces
	// name them the way Go does (licenseFamily and LicenseFamily, _health and
	// Health), so both sides are folded to one spelling before they are compared.
	required := map[string]string{}
	for field, scope := range kaitengraphql.FieldScopes() {
		gqlType, name, _ := strings.Cut(field, ".")
		required[resolverKey(gqlType, name)] = scope
	}
	if len(required) == 0 {
		t.Fatal("the scope gate requires a scope for no field at all -- this test would then pin every resolver as unscoped")
	}

	actual := map[string]string{}
	pkgScope := generated.Types.Scope()
	for _, name := range pkgScope.Names() {
		if name == "ResolverRoot" || !strings.HasSuffix(name, "Resolver") {
			continue
		}
		typeName, ok := pkgScope.Lookup(name).(*types.TypeName)
		if !ok {
			continue
		}
		iface, ok := typeName.Type().Underlying().(*types.Interface)
		if !ok {
			continue
		}
		gqlType := strings.TrimSuffix(name, "Resolver")
		for i := range iface.NumMethods() {
			method := iface.Method(i).Name()
			actual[gqlType+"."+method] = required[resolverKey(gqlType, method)]
		}
	}

	var added, changed, removed []string
	for _, resolver := range sortedKeys(actual) {
		pinned, isPinned := pinnedGraphQLResolvers[resolver]
		switch {
		case !isPinned:
			added = append(added, fmt.Sprintf("%q: %q,", resolver, actual[resolver]))
		case pinned != actual[resolver]:
			changed = append(changed, fmt.Sprintf("%s is pinned to %q and the gate requires %q",
				resolver, pinned, actual[resolver]))
		}
	}
	for _, resolver := range sortedKeys(pinnedGraphQLResolvers) {
		if _, exists := actual[resolver]; !exists {
			removed = append(removed, resolver)
		}
	}
	if len(added) == 0 && len(changed) == 0 && len(removed) == 0 {
		return
	}

	report := []string{"the GraphQL resolver surface no longer matches pinnedGraphQLResolvers."}
	if len(added) > 0 {
		report = append(report, fmt.Sprintf(
			"%d new resolver(s), each with the scope the gate requires to select it. An empty scope means a caller "+
				"is served it on the strength of the value it sits on alone: confirm it reads nothing beyond that "+
				"value, and say so beside the entry. Then add these to pinnedGraphQLResolvers:\n  %s",
			len(added), strings.Join(added, "\n  "),
		))
	}
	if len(changed) > 0 {
		report = append(report, fmt.Sprintf(
			"%d resolver(s) no longer require the scope they are pinned to. If the change to the gate is intended, "+
				"re-pin them; every token that reads these fields is affected:\n  %s",
			len(changed), strings.Join(changed, "\n  "),
		))
	}
	if len(removed) > 0 {
		report = append(report, fmt.Sprintf(
			"%d resolver(s) are pinned but no longer exist -- delete them from pinnedGraphQLResolvers:\n  %s",
			len(removed), strings.Join(removed, "\n  "),
		))
	}
	t.Error(strings.Join(report, "\n\n"))
}

// resolverKey folds a field's schema name and its resolver's Go name onto one
// spelling.
func resolverKey(gqlType, field string) string {
	return gqlType + "." + strings.ToLower(strings.ReplaceAll(field, "_", ""))
}

func displayNamespace(prefix string) string {
	if prefix == "" {
		return "the Core namespace"
	}
	return prefix
}
