// The tests here guard the boundary internal/kaiten exists to draw, against the
// invariants stated in that package's doc.go.
//
// TestEveryCredentialedFacadeMethodRequiresItsOperationsScope and
// TestEveryRegistrarPassesItsOwnPackagesRequiredScope are two halves of one
// rule, and neither is worth much alone: enforcement without publication is an
// undocumented 403, publication without enforcement is a lie in the contract.
//
// All discover what they check at runtime through go/packages, so a cached PASS
// can outlive a real violation -- rerun with -count=1 after touching the facade.
// All carry the anti-vacuous-pass guards this directory insists on: a reflective
// test that resolves nothing passes, which is the worst failure mode a fitness
// function has.
package architecture_test

import (
	"fmt"
	"go/ast"
	"go/types"
	"regexp"
	"sort"
	"strings"
	"testing"

	"golang.org/x/tools/go/packages"
)

const facadePkg = "github.com/kaitencloud/kaiten/api/internal/kaiten"

const (
	principalPkg = "github.com/kaitencloud/kaiten/api/internal/platform/principal"
	targetorgPkg = "github.com/kaitencloud/kaiten/api/internal/platform/targetorg"
	callerPkg    = "github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// facadeForbiddenPackages are the packages internal/kaiten may not name in an
// exported signature, each with the reason it is on the list -- the reason is the
// failure message, because "kaiten must not import fiber" is not by itself an
// argument anyone can act on.
//
// Matched by prefix, so a subpackage (huma's adapters, fiber's middleware) is
// covered without being listed.
var facadeForbiddenPackages = map[string]string{
	humaPkg: "the facade would then only be reachable over HTTP, which is the coupling it exists to remove; " +
		"huma.Operation literals belong in the slice's own endpoint.go",
	fiberPkg: "same as huma -- a raw Fiber route is still a transport, and a use case reached through one " +
		"should arrive at the same facade method as a huma operation",
	principalPkg: "a principal is a credential the transport verified; the facade takes a caller.* value instead, " +
		"which is what lets a driver with no credentials (the seeder, cmd/admin-tools) call the same method",
	targetorgPkg: "the target organization of a platform operation is an argument, not ambient context -- " +
		"folding it into the caller is the escalation the design exists to prevent",
}

// generatedDBPattern matches a module's generated sqlc package. Naming one in an
// exported signature would put a wire-shaped row type in the facade's vocabulary,
// which is the leak internal/modules/*/schema already exists to stop.
var generatedDBPattern = regexp.MustCompile(`/internal/modules/[^/]+/infrastructure/db$`)

// minFacadeExportedSymbols is a floor, not a pin: it exists so that a rename of
// the package, or type information failing to resolve, fails loudly instead of
// passing with nothing walked.
const minFacadeExportedSymbols = 4

func forbiddenFacadePackage(path string) (reason string, forbidden bool) {
	for prefix, why := range facadeForbiddenPackages {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return why, true
		}
	}
	if generatedDBPattern.MatchString(path) {
		return "a generated sqlc package is a storage detail; the facade speaks the slice's schema types", true
	}
	return "", false
}

// facadeTypeViolations reports every forbidden package t names, walking through
// the type constructors that can wrap one. It deliberately does not follow a
// named type into its own definition: what matters is the vocabulary the facade
// hands its callers, and *customers.UseCases is customers' name for customers'
// graph, not a transport type, whatever that graph is made of.
func facadeTypeViolations(t types.Type, seen map[types.Type]bool) []string {
	if t == nil || seen[t] {
		return nil
	}
	seen[t] = true

	switch typ := t.(type) {
	case *types.Named:
		obj := typ.Obj()
		if obj.Pkg() == nil {
			return nil // a builtin such as error
		}
		if reason, forbidden := forbiddenFacadePackage(obj.Pkg().Path()); forbidden {
			return []string{fmt.Sprintf("%s (%s)", types.TypeString(typ, nil), reason)}
		}
		return nil
	case *types.Pointer:
		return facadeTypeViolations(typ.Elem(), seen)
	case *types.Slice:
		return facadeTypeViolations(typ.Elem(), seen)
	case *types.Array:
		return facadeTypeViolations(typ.Elem(), seen)
	case *types.Chan:
		return facadeTypeViolations(typ.Elem(), seen)
	case *types.Map:
		return append(facadeTypeViolations(typ.Key(), seen), facadeTypeViolations(typ.Elem(), seen)...)
	case *types.Signature:
		var out []string
		for _, tuple := range []*types.Tuple{typ.Params(), typ.Results()} {
			for i := range tuple.Len() {
				out = append(out, facadeTypeViolations(tuple.At(i).Type(), seen)...)
			}
		}
		return out
	case *types.Struct:
		var out []string
		for i := range typ.NumFields() {
			field := typ.Field(i)
			if !field.Exported() {
				continue
			}
			out = append(out, facadeTypeViolations(field.Type(), seen)...)
		}
		return out
	default:
		return nil
	}
}

// TestFacadeExportsNoTransportType fails when an exported signature or field in
// internal/kaiten names huma, fiber, principal, targetorg or a module's generated
// sqlc package.
func TestFacadeExportsNoTransportType(t *testing.T) {
	pkgs := loadModule(t)

	loaded := make(map[string]bool)
	var facade *packages.Package
	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		loaded[pkg.PkgPath] = true
		if pkg.PkgPath == facadePkg {
			facade = pkg
		}
	})

	// The guards. A forbidden path that no longer exists stops matching silently,
	// and a package that failed to type-check has an empty scope, so both would
	// leave this test green with nothing checked.
	if facade == nil || facade.Types == nil {
		t.Fatalf("package %q did not load with type information -- has the facade moved or failed to compile?", facadePkg)
	}
	for path := range facadeForbiddenPackages {
		if !loaded[path] {
			t.Fatalf("forbidden package %q is not in the loaded module any more -- it was renamed or dropped, "+
				"and this test has been checking a path nothing can match", path)
		}
	}

	var violations []string
	inspected := 0
	scope := facade.Types.Scope()
	for _, name := range scope.Names() {
		obj := scope.Lookup(name)
		if !obj.Exported() {
			continue
		}
		inspected++

		report := func(what string, found []string) {
			for _, v := range found {
				violations = append(violations, fmt.Sprintf("%s: %s names %s", facade.Fset.Position(obj.Pos()), what, v))
			}
		}

		seen := map[types.Type]bool{}
		report(name, facadeTypeViolations(obj.Type(), seen))

		typeName, ok := obj.(*types.TypeName)
		if !ok {
			continue
		}
		// Methods on both the value and the pointer receiver set: which one carries a
		// given method is a choice about mutation, never about what may be named.
		for _, recv := range []types.Type{typeName.Type(), types.NewPointer(typeName.Type())} {
			methods := types.NewMethodSet(recv)
			for i := range methods.Len() {
				method := methods.At(i).Obj()
				if !method.Exported() {
					continue
				}
				report(name+"."+method.Name(), facadeTypeViolations(method.Type(), seen))
			}
		}
	}

	if inspected < minFacadeExportedSymbols {
		t.Fatalf("only %d exported symbol(s) found in %q, expected at least %d -- "+
			"the walk is resolving nothing and this test is passing vacuously",
			inspected, facadePkg, minFacadeExportedSymbols)
	}

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d transport type(s) in the facade's exported surface:\n%s\n\n"+
			"The fix is not to widen this list. A transport type in a facade signature means the operation is "+
			"being described where it should be called: move the description to the slice's endpoint.go and pass "+
			"the facade the use case's own *Command.",
			len(violations), strings.Join(violations, "\n"))
	}
}

// literalSite is one composite literal of a type this file counts: the package
// that wrote it and where.
type literalSite struct{ pkgPath, pos string }

// namedType resolves pkgPath.name, or fails the test.
//
// It fails rather than returning nil because the alternative is the vacuous pass:
// a renamed type resolves to nothing, nothing matches it, and the test reports no
// violations from a walk that inspected zero nodes.
func namedType(t *testing.T, pkgs []*packages.Package, pkgPath, name string) types.Type {
	t.Helper()

	var found types.Type
	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		if pkg.PkgPath != pkgPath || pkg.Types == nil {
			return
		}
		if obj := pkg.Types.Scope().Lookup(name); obj != nil {
			found = obj.Type()
		}
	})
	if found == nil {
		t.Fatalf("type %s.%s did not resolve -- it was renamed or moved, and the test that counts its "+
			"literals can no longer recognise one", pkgPath, name)
	}
	return found
}

// compositeLiteralSites reports every composite literal of typ in the module's
// production source (loadModule passes Tests: false).
func compositeLiteralSites(pkgs []*packages.Package, typ types.Type) []literalSite {
	var sites []literalSite

	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		if pkg.TypesInfo == nil {
			return
		}
		for _, file := range pkg.Syntax {
			ast.Inspect(file, func(n ast.Node) bool {
				lit, ok := n.(*ast.CompositeLit)
				if !ok {
					return true
				}
				if !types.Identical(pkg.TypesInfo.TypeOf(lit), typ) {
					return true
				}
				sites = append(sites, literalSite{pkg.PkgPath, pkg.Fset.Position(lit.Pos()).String()})
				return true
			})
		}
	})

	return sites
}

// principalConstructors are the packages allowed to build a principal.Principal,
// with the door each one is.
//
// There is no staleness check on this map -- unlike publicFiberRoutes in
// entry_point_scope_test.go -- because internal/kaiten legitimately has no
// literal until the commit that adds caller binding, and a test that demanded one
// early would have to be silenced rather than satisfied.
var principalConstructors = map[string]string{
	"github.com/kaitencloud/kaiten/api/internal/platform/auth": "from a credential it verified",
	facadePkg: "from a caller, which is the only other way identity legitimately enters",

	// The integration harness, whose StubMiddleware and StubPlatformMiddleware stand
	// in for internal/platform/auth so a test can present a credential class without
	// a real token. It is visible to this walk -- which skips _test.go files -- only
	// because the harness lives in testserver.go, and it is on the list rather than
	// filtered out by path so that a second harness cannot appear unremarked.
	"github.com/kaitencloud/kaiten/api/tests": "stands in for auth in the integration harness",
}

// TestPrincipalIsConstructedInAllowedPackagesOnly fails when any package outside
// principalConstructors builds a principal.Principal.
//
// The invariant every authorization check rests on: principal.FromContext answers
// what class of credential is acting, and currentuser.GetUser turns that into the
// organization every downstream dereference assumes. A third constructor is a
// third answer, indistinguishable from the two that were verified.
//
// Production source only: a principal built in a _test.go file is a fixture, not
// a door.
func TestPrincipalIsConstructedInAllowedPackagesOnly(t *testing.T) {
	pkgs := loadModule(t)

	principalType := namedType(t, pkgs, principalPkg, "Principal")
	sites := compositeLiteralSites(pkgs, principalType)

	if len(sites) == 0 {
		t.Fatalf("no principal.Principal literal found anywhere in the module -- internal/platform/auth builds "+
			"one on every authenticated request, so finding none means the walk is broken, not that the "+
			"invariant holds (expected at least the two in %s/auth.go)", principalPkg)
	}

	var violations []string
	for _, s := range sites {
		if _, allowed := principalConstructors[s.pkgPath]; allowed {
			continue
		}
		violations = append(violations, fmt.Sprintf("%s: package %s builds a principal.Principal", s.pos, s.pkgPath))
	}

	if len(violations) > 0 {
		sort.Strings(violations)

		allowed := make([]string, 0, len(principalConstructors))
		for path, door := range principalConstructors {
			allowed = append(allowed, fmt.Sprintf("  %s -- %s", path, door))
		}
		sort.Strings(allowed)

		t.Errorf("found %d principal.Principal literal(s) outside the two packages allowed to build one:\n%s\n\n"+
			"Allowed:\n%s\n\nIf the new site is a transport verifying a credential, it belongs behind "+
			"internal/platform/auth. If it is a driver acting without one, it wants a caller.* value and a "+
			"facade method -- the facade is what turns a caller into a principal, exactly once.",
			len(violations), strings.Join(violations, "\n"), strings.Join(allowed, "\n"))
	}
}

const servicesPkg = "github.com/kaitencloud/kaiten/api/internal/infrastructure/services"

// TestServicesContainerIsConstructedOnlyInTheFacade fails when any package other
// than internal/kaiten builds a services.Container.
//
// The composition-root property, and about a specific failure rather than
// tidiness: a Container is what a module reads its dependencies off, and a driver
// assembling its own satisfies the compiler with any subset. A sweeper started
// with no registry to stop it is a goroutine leak. One literal turns "which field
// did this driver forget" into a question nobody can ask.
//
// Production source only, so an integration test may still build a partial
// container to drive a module in isolation.
func TestServicesContainerIsConstructedOnlyInTheFacade(t *testing.T) {
	pkgs := loadModule(t)

	containerType := namedType(t, pkgs, servicesPkg, "Container")
	sites := compositeLiteralSites(pkgs, containerType)

	if len(sites) == 0 {
		t.Fatalf("no services.Container literal found anywhere in the module -- %s builds the only one there "+
			"should be, so finding none means this walk is broken rather than that the invariant holds", facadePkg)
	}

	var violations []string
	for _, s := range sites {
		if s.pkgPath == facadePkg {
			continue
		}
		violations = append(violations, fmt.Sprintf("%s: package %s builds a services.Container", s.pos, s.pkgPath))
	}

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d services.Container literal(s) outside %s:\n%s\n\n"+
			"A driver does not assemble the application, it asks for one: kaiten.New(kaiten.Options{...}). If an "+
			"Option is missing for what this driver needs, adding it is the work -- that way every other driver "+
			"gets the same answer, and the field cannot be quietly omitted.",
			len(violations), facadePkg, strings.Join(violations, "\n"))
	}
}

// The two names invariant 2 is written in terms of.
//
// requiredScopeSuffix is a suffix, not a whole name: a slice package is a use
// case and not necessarily one operation, so a slice backing two declares
// CustomerRequiredScope and InstanceRequiredScope. What the convention guarantees
// is one *named* value per operation in the operation's own package, referenced
// by both the registrar and the facade.
//
// useCaseTypeName is the type a slice's operation entry points hang off, which is
// how the walk learns what operation a facade method fronts with no list to keep
// current. The receiver rather than the method name, because the name is not
// uniform -- a slice backing two operations names them for what they act on. If
// the receiver spelling changes, the floor below turns the silence into a
// failure.
const (
	requiredScopeSuffix = "RequiredScope"
	useCaseTypeName     = "UseCase"
)

// credentialedCallerTypes are the caller types that carry scopes, and therefore the
// ones a scope can be required of. There is no third entry, because there is no
// third caller type: the credential-free surface takes no caller at all, so nothing
// there could be asked for a scope even by mistake. The other half of invariant 2 --
// that those methods require none -- is asserted from the namespace instead, in
// inprocess_isolation_test.go.
var credentialedCallerTypes = []string{"OrganizationCaller", "PlatformCaller"}

// minScopedFacadeMethods is a floor that rose with each batch of operations moved
// onto the facade, and has stopped rising. It is what stops the walk below from
// passing on nothing: a renamed caller type, a facade method that stopped being
// exported, or a receiver spelling this code no longer recognises would all
// otherwise leave it green.
const minScopedFacadeMethods = 100

// usedObject resolves an expression that names a package-level object -- a bare
// identifier for one declared in the same package, a selector for one from another
// -- and returns nil for anything that is not one, which includes the case this
// file most wants to catch: a scope computed at runtime.
func usedObject(info *types.Info, expr ast.Expr) types.Object {
	switch e := ast.Unparen(expr).(type) {
	case *ast.Ident:
		return info.Uses[e]
	case *ast.SelectorExpr:
		return info.Uses[e.Sel]
	default:
		return nil
	}
}

// useCasePackage reports the package of the slice whose UseCase declares obj, and
// false for anything that is not a method on one.
//
// The receiver is what identifies an operation entry point, so this unwraps it: a
// *types.Func with a receiver, dereferenced past the pointer every UseCase method
// takes, down to the named type. obj.Pkg() would answer the same package, but only
// after the receiver check has established there is an operation to answer about.
func useCasePackage(obj types.Object) (string, bool) {
	fn, ok := obj.(*types.Func)
	if !ok {
		return "", false
	}
	recv := fn.Signature().Recv()
	if recv == nil {
		return "", false
	}
	recvType := types.Unalias(recv.Type())
	if ptr, isPtr := recvType.(*types.Pointer); isPtr {
		recvType = types.Unalias(ptr.Elem())
	}
	named, ok := recvType.(*types.Named)
	if !ok || named.Obj().Name() != useCaseTypeName || named.Obj().Pkg() == nil {
		return "", false
	}
	return named.Obj().Pkg().Path(), true
}

// scopeAndExecuteTargets reports, for one function body, the packages whose
// RequiredScope it references and the packages whose UseCase methods it calls.
//
// It matches on identifiers rather than on selector expressions because every
// selector's Sel is itself an identifier the walk visits, so pkg.RequiredScope and a
// same-package RequiredScope are found by one case instead of two. Both results are
// sets: a method that names the same scope twice says nothing different.
func scopeAndExecuteTargets(info *types.Info, body ast.Node) (scopes, executes map[string]bool) {
	scopes, executes = map[string]bool{}, map[string]bool{}

	ast.Inspect(body, func(n ast.Node) bool {
		ident, ok := n.(*ast.Ident)
		if !ok {
			return true
		}
		obj := info.Uses[ident]
		if obj == nil || obj.Pkg() == nil {
			return true
		}

		if strings.HasSuffix(ident.Name, requiredScopeSuffix) {
			scopes[obj.Pkg().Path()] = true
			return true
		}
		if pkgPath, isOperation := useCasePackage(obj); isOperation {
			executes[pkgPath] = true
		}
		return true
	})

	return scopes, executes
}

// methodLabel spells a method as Receiver.Name, for a failure message that can be
// grepped for.
func methodLabel(fn *ast.FuncDecl) string {
	receiver := "?"
	if fn.Recv != nil && len(fn.Recv.List) > 0 {
		receiver = strings.TrimPrefix(types.ExprString(ast.Unparen(fn.Recv.List[0].Type)), "*")
	}
	return receiver + "." + fn.Name.Name
}

// takesCallerType reports whether any parameter of fn is one of the given caller
// types. Which caller a facade method takes is the whole of invariant 3 -- credential
// class is structural here, not a runtime check -- so this is how both halves of
// invariant 2 find the methods they are about: this file passes the scope-carrying
// types, inprocess_isolation_test.go passes the one that carries none.
func takesCallerType(info *types.Info, fn *ast.FuncDecl, callers []types.Type) bool {
	if fn.Type.Params == nil {
		return false
	}
	for _, field := range fn.Type.Params.List {
		paramType := info.TypeOf(field.Type)
		if paramType == nil {
			continue
		}
		for _, want := range callers {
			if types.Identical(paramType, want) {
				return true
			}
		}
	}
	return false
}

// TestEveryCredentialedFacadeMethodRequiresItsOperationsScope is the facade half of
// invariant 2: every exported method in internal/kaiten that takes a scope-carrying
// caller requires the RequiredScope of the use case it runs, and requires no other.
//
// Stated as set equality between "scopes named" and "use cases run", which makes
// it self-widening: nothing here lists the operations, so the walk learns which
// one a method fronts from the package declaring the Execute it calls.
//
// Both directions fail differently. A method running a use case without requiring
// its scope is an operation anyone can call, and the document still advertises a
// scope so the gap is invisible from outside. A method requiring a scope it does
// not run is subtler: usually a copied line now guarding the wrong operation,
// which reads as correct in review precisely because a check is present.
//
// Unexported helpers are out of scope: Platform.bindTarget takes the scope as a
// parameter rather than naming one, and the const it checks is named by each
// exported caller, where this walk sees it.
func TestEveryCredentialedFacadeMethodRequiresItsOperationsScope(t *testing.T) {
	pkgs := loadModule(t)

	var facade *packages.Package
	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		if pkg.PkgPath == facadePkg {
			facade = pkg
		}
	})
	if facade == nil || facade.TypesInfo == nil {
		t.Fatalf("package %q did not load with type information -- has the facade moved or failed to compile?", facadePkg)
	}

	// namedType fails the test itself if a caller type was renamed, which is the
	// guard that matters most here: an unrecognised parameter type means no method
	// matches, and a walk over no methods reports no violations.
	credentialed := make([]types.Type, 0, len(credentialedCallerTypes))
	for _, name := range credentialedCallerTypes {
		credentialed = append(credentialed, namedType(t, pkgs, callerPkg, name))
	}

	var violations []string
	walked := 0

	for _, file := range facade.Syntax {
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Recv == nil || fn.Body == nil || !fn.Name.IsExported() {
				continue
			}
			if !takesCallerType(facade.TypesInfo, fn, credentialed) {
				continue
			}
			walked++

			label := methodLabel(fn)
			pos := facade.Fset.Position(fn.Pos())
			scopes, executes := scopeAndExecuteTargets(facade.TypesInfo, fn.Body)

			if len(scopes) == 0 && len(executes) == 0 {
				violations = append(violations, fmt.Sprintf(
					"%s: %s takes a credentialed caller but neither requires a scope nor runs a use case -- "+
						"a method on this surface exists to authorize one operation and call it",
					pos, label))
				continue
			}

			for _, pkgPath := range sortedKeys(setDifference(executes, scopes)) {
				violations = append(violations, fmt.Sprintf(
					"%s: %s calls %s.Execute but requires no scope from %s -- the operation is published as needing "+
						"one and enforces none",
					pos, label, shortPkg(pkgPath), shortPkg(pkgPath)))
			}
			for _, pkgPath := range sortedKeys(setDifference(scopes, executes)) {
				violations = append(violations, fmt.Sprintf(
					"%s: %s requires a %s from %s but runs no use case from it -- a scope check on the wrong "+
						"operation reads as correct in review",
					pos, label, requiredScopeSuffix, shortPkg(pkgPath)))
			}
		}
	}

	if walked < minScopedFacadeMethods {
		t.Fatalf("only %d exported facade method(s) take a %v, expected at least %d -- the walk is matching "+
			"nothing and this test is passing vacuously; if operations were removed, lower the floor deliberately",
			walked, credentialedCallerTypes, minScopedFacadeMethods)
	}

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d facade method(s) whose scope and use case disagree:\n%s\n\n"+
			"The pair is the invariant: cl.Require(<usecase>.%s) followed by <usecase>.Execute, with the same "+
			"package on both lines. If a method genuinely fronts more than one use case, it is two facade methods.",
			len(violations), strings.Join(violations, "\n"), requiredScopeSuffix)
	}
}

// TestEveryRegistrarPassesItsOwnPackagesRequiredScope is the transport half of
// invariant 2: the scope a registrar publishes into the OpenAPI document is a named
// value its own package declares, not a scope.Read(...) call written inline and not
// a neighbour's const.
//
// Without it the facade half above can be satisfied while the document says
// something else, and a mismatch is a 403 on a token minted from the docs.
//
// Two things are asserted, each ruling out one way of losing the property. A
// value computed at the call site cannot be referenced from the facade at all, so
// the two sides share nothing. A value borrowed from another slice can be shared,
// but it names two operations, and changing the scope of one changes the other.
func TestEveryRegistrarPassesItsOwnPackagesRequiredScope(t *testing.T) {
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
			t.Fatalf("%s.%s no longer exists -- this test walks for it by name, so it would pass vacuously; "+
				"update registrarOperationArg", kaitenHumaPkg, registrar)
		}
	}

	var violations []string
	seen := 0

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

				// Register*(api, operation, scope, handler): the scope sits one past the
				// operation, whichever registrar this is.
				scopeArg := opArg + 1
				pos := pkg.Fset.Position(call.Pos())
				if len(call.Args) <= scopeArg {
					violations = append(violations, fmt.Sprintf(
						"%s: %s is called with %d argument(s), too few to carry a scope -- registrarOperationArg "+
							"is describing a signature that changed", pos, name, len(call.Args)))
					return true
				}
				seen++

				obj := usedObject(pkg.TypesInfo, call.Args[scopeArg])
				switch {
				case obj == nil || obj.Pkg() == nil || obj.Parent() != obj.Pkg().Scope():
					violations = append(violations, fmt.Sprintf(
						"%s: %s is passed a scope that is not a package-level declaration -- a value computed at "+
							"the call site is one the facade cannot reference, so there is nothing for the two "+
							"sides to share", pos, name))
				case !strings.HasSuffix(obj.Name(), requiredScopeSuffix):
					violations = append(violations, fmt.Sprintf(
						"%s: %s is passed %s, which does not end in %s -- the suffix is how a reader and this test "+
							"tell an operation's scope from any other string in the package",
						pos, name, obj.Name(), requiredScopeSuffix))
				case obj.Pkg().Path() != pkg.PkgPath:
					violations = append(violations, fmt.Sprintf(
						"%s: %s is passed %s.%s, another package's declaration -- it now names two operations, and "+
							"changing the scope of one changes the other silently",
						pos, name, shortPkg(obj.Pkg().Path()), obj.Name()))
				}
				return true
			})
		}
	})

	if seen < minRegistrarCallSites {
		t.Fatalf("only %d registrar call(s) found, expected at least %d -- the walk is broken rather than the "+
			"surface having shrunk that far", seen, minRegistrarCallSites)
	}

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d registrar call(s) not publishing their own package's %s:\n%s",
			len(violations), requiredScopeSuffix, strings.Join(violations, "\n"))
	}
}

// setDifference returns the keys of a that b does not have.
func setDifference(a, b map[string]bool) map[string]bool {
	out := map[string]bool{}
	for key := range a {
		if !b[key] {
			out[key] = true
		}
	}
	return out
}

// sortedKeys makes a map's iteration order stable, so a failure message is the same
// on every run. Generic in the value because some of these maps carry a count or a
// reason alongside the key, and only the key is being listed.
func sortedKeys[V any](set map[string]V) []string {
	keys := make([]string, 0, len(set))
	for key := range set {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// shortPkg trims an import path to its last element, which is the name the offending
// line actually uses.
func shortPkg(path string) string {
	if i := strings.LastIndex(path, "/"); i >= 0 {
		return path[i+1:]
	}
	return path
}

// hasReceiverType reports whether fn is a method declared on recv.
//
// The counterpart to takesCallerType, for the surface that identifies its methods by
// what they are declared on rather than by what they accept: kaiten.InProcess takes
// no caller, so its receiver is the only thing that marks a method as belonging to
// the credential-free surface.
func hasReceiverType(info *types.Info, fn *ast.FuncDecl, recv types.Type) bool {
	if fn.Recv == nil || len(fn.Recv.List) == 0 {
		return false
	}
	receiverType := info.TypeOf(fn.Recv.List[0].Type)
	if receiverType == nil {
		return false
	}
	if ptr, ok := receiverType.(*types.Pointer); ok {
		receiverType = ptr.Elem()
	}
	return types.Identical(receiverType, recv)
}
