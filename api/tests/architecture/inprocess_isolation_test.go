// The tests here are invariant 5 from internal/kaiten/doc.go: the credential-free
// surface stays credential-free, and stays reachable only from the three drivers that
// legitimately run before or beneath a credential.
package architecture_test

import (
	"fmt"
	"go/ast"
	"go/types"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"golang.org/x/tools/go/packages"
)

// inProcessUseCasePkgs are the credential-free slices, each with the reason no
// transport could publish it. The reasons are the failure messages: a rule
// without its argument is what someone deletes when it is inconvenient.
//
// organization/ensuremembership has no facade method of its own -- it is composed
// into users/ensureuser -- but purity and the allowlist are properties of the
// package, not of the method that fronts it.
var inProcessUseCasePkgs = map[string]string{
	modulesPrefix + "organization/ensureorganization": "runs on the authentication path, while the token " +
		"carrying the claims that name the organization is still being resolved -- there is no credential yet " +
		"to authorize it with",
	modulesPrefix + "organization/listorganizations": "cross-tenant enumeration, which is precisely what the " +
		"Platform API's invisibility rules exist to prevent",
	modulesPrefix + "organization/ensuremembership": "same authentication path as ensureorganization; its only " +
		"caller is users/ensureuser, inside the transaction that writes the user row",
	modulesPrefix + "users/ensureuser": "same authentication path -- a user is provisioned from JWT claims " +
		"before anything about them exists to authorize against",
	modulesPrefix + "users/resolveuser": "neither document publishes a get-user, because a user is global and " +
		"a lookup keyed on a provider's subject is a cross-tenant question; the wire's answer is " +
		"externalid.DeriveUserID, which cannot answer for a row this deployment did not derive",
	modulesPrefix + "users/suggestusers": "a prefix search over a global user table is a directory, which is the " +
		"same enumeration -- and unlike resolveuser there is not even a derivable substitute, because a prefix " +
		"names nobody in particular",
	modulesPrefix + "identity/createplatformtoken": "mints the credential the Platform API authenticates " +
		"with, so an API requiring one could never issue the first",
	modulesPrefix + "identity/listplatformtokens": "cross-credential enumeration; the wire counterpart that " +
		"does exist is getplatformcredential, which answers only \"who am I\"",
	modulesPrefix + "identity/revokeplatformtoken": "retiring a credential by name means naming one you are " +
		"not holding, which is the same enumeration -- Platform.RevokeOrganizationToken retires a child instead",
	modulesPrefix + "connectors/registerconnector": "a connector compiled into this binary registers its " +
		"manifest while the process is starting: there is no credential to present, because the deployment " +
		"that would issue one may not be bootstrapped yet and the server has not begun serving",
}

// dualPublishedUseCasePkgs are the credential-free slices that ALSO appear on the
// wire. Each is exempt from the purity checks in
// TestInProcessUseCasePackagesCannotBePublished, may be imported by a transport
// package, and owes the stricter obligation
// TestDualPublishedUseCasesAreReachedBothWays states.
//
// The admission test for the credential-free surface turns on "impossible for
// this caller": an operation reached both by a credential holder and by something
// arriving before there is one to hold has an impossible counterpart for the
// second and an ordinary one for the first. Refusing the endpoint would only mean
// handing the credentialed caller the database instead.
//
// What is given up: for these packages the absence of endpoint.go stops being the
// signal that the operation is off the wire. What replaces it is narrower, not
// weaker -- the endpoint is registered through the platform registrar, so it
// cannot be reached without a credential. The call-site allowlist is NOT relaxed.
var dualPublishedUseCasePkgs = map[string]string{
	modulesPrefix + "organization/ensureorganization": "asked from both sides of the credential line: JIT " +
		"provisioning cannot hold a credential because it is the code resolving one, while a bootstrapper with " +
		"a platform token creating the organization it is about to mint into can and does -- and the answer to " +
		"that second caller is an endpoint, not a database connection string",
	modulesPrefix + "connectors/registerconnector": "the same two callers, one line apart: a connector built " +
		"into this binary registers at startup with nothing to present, while a connector hosted elsewhere is " +
		"an ordinary client holding a ksm_ token -- and the answer to the second is " +
		"POST /platform/connectors, not the database",
}

// inProcessCallSites are the packages allowed to name the in-process surface,
// with the reason each arrives without a credential. Short by design, and the
// design degrades if it grows: every entry is a place where "who is acting" has no
// answer.
//
// The module aggregators are on it because they construct these use cases, which
// is a write of the field rather than a call. Nothing outside internal/kaiten can
// obtain a *UseCases to read one back off, which
// TestServicesContainerIsConstructedOnlyInTheFacade pins.
//
// The use case packages are allowed implicitly, added below, because
// users/ensureuser composes organization/ensuremembership.
var inProcessCallSites = map[string]string{
	facadePkg: "the facade itself -- InProcess is the namespace these operations are published on, and " +
		"bindInProcess is the one place a credential-free principal is built",
	modulesPrefix + "organization": "constructs EnsureOrganization and ListOrganizations",
	modulesPrefix + "users":        "constructs EnsureUser, ResolveUser and SuggestUsers",
	modulesPrefix + "identity":     "constructs the three platform-credential use cases",

	serverPkg: "the composition root for the HTTP process, and wiring only -- it hands the surface to " +
		"jit.NewProvisioner and never calls an operation on it, which " +
		"TestInProcessWiringPackagesNeverInvokeTheSurface enforces separately",

	jitPkg: "runs midway through resolving a request's own principal: it is the code that decides who is " +
		"acting, so it cannot itself act as anyone",
	adminToolsPkg: "a process holding the database connection string, which is the only bound that applies " +
		"before a credential exists",
	seederPkg: "populates a deployment that has no users yet",
}

const (
	modulesPrefix = "github.com/kaitencloud/kaiten/api/internal/modules/"
	jitPkg        = "github.com/kaitencloud/kaiten/api/internal/platform/jit"
	serverPkg     = "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/server"
	adminToolsPkg = "github.com/kaitencloud/kaiten/api/cmd/admin-tools"
	seederPkg     = "github.com/kaitencloud/kaiten/api/internal/seeder"
)

// How the credential-free surface is named in source: the facade type carrying
// its methods, and the accessor that hands one out. Reaching an operation
// requires naming one or the other, so together they are what the allowlist
// watches.
//
// inProcessWiringOnlyPkgs may name the surface but must never invoke an operation
// on it. They are on inProcessCallSites because the object graph has to be
// assembled somewhere, and the assembly names both halves.
//
// The distinction matters because internal/.../http/server is a transport package
// -- the class this file exists to keep away from these operations. It holds a
// value with eight unauthenticated methods, and what makes that safe is not the
// holding but that it only ever passes the value along.
var inProcessWiringOnlyPkgs = map[string]string{
	serverPkg: "it injects the surface into jit.NewProvisioner; calling an operation from a package that " +
		"serves requests is the unauthenticated write this surface is fenced off to prevent",
}

const (
	inProcessNamespaceType = "InProcess"
	inProcessAccessor      = "InProcess"
	facadeAppType          = "Kaiten"

	// platformNamespaceType is the credentialed namespace a dual-published slice's
	// other half lives on. Named here rather than in the test that uses it because a
	// rename has to break one place, not two.
	platformNamespaceType = "Platform"
)

// endpointFile is the structural marker of a published operation. Every slice that
// has one owns a huma.Operation literal; a credential-free slice has none, and that
// absence is what makes "this operation is not on the wire" reviewable from a file
// listing rather than only from a type signature.
const endpointFile = "endpoint.go"

// minInProcessFacadeMethods is a floor, and it is also the number the admission test
// is stated about. Nine today: RegisterConnector, EnsureOrganization, EnsureUser,
// ResolveUser, SuggestUsers, ListOrganizations, CreatePlatformToken,
// ListPlatformTokens, RevokePlatformToken.
//
// A ninth is not forbidden -- it is a decision. Raising this number is where that
// decision gets made, and the reviewer of that diff is being asked whether the new
// operation genuinely could not be published, not whether it merely is not.
const minInProcessFacadeMethods = 9

// loadedPackage returns the loaded package at path, or fails the test.
//
// It fails rather than returning nil for the reason namedType does: a package that
// moved resolves to nothing, and a walk over nothing is a green test.
func loadedPackage(t *testing.T, pkgs []*packages.Package, path string) *packages.Package {
	t.Helper()

	var found *packages.Package
	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		if pkg.PkgPath == path {
			found = pkg
		}
	})
	if found == nil {
		t.Fatalf("package %q did not load -- it was moved or renamed, and the test that walks it can no longer "+
			"find anything to check", path)
	}
	if found.Types == nil || found.TypesInfo == nil {
		t.Fatalf("package %q loaded without type information -- fix the build before trusting this test", path)
	}
	return found
}

// inProcessTargets collects every object whose use is a reference to the
// credential-free surface: the namespace type, the accessor, and every struct
// field in the tree holding one of the credential-free use cases.
//
// The accessor catches the leak worth catching: a transport package calling
// app.InProcess().ListOrganizations(ctx) imports nothing on the use case list, so
// the method is the only thing this file can see it name.
//
// The fields are discovered rather than listed, which is what makes the allowlist
// hard to route around: reading .CreatePlatformToken off a *UseCases is a
// reference no import check would see, because the import is of the module.
//
// Objects are mapped to a human label, because a failure has to name what was
// referenced, not just where.
func inProcessTargets(t *testing.T, pkgs []*packages.Package) map[types.Object]string {
	t.Helper()

	targets := map[types.Object]string{}

	facade := loadedPackage(t, pkgs, facadePkg)

	namespace := facade.Types.Scope().Lookup(inProcessNamespaceType)
	if namespace == nil {
		t.Fatalf("kaiten.%s did not resolve -- the credential-free namespace was renamed, and the allowlist "+
			"below can no longer recognise a reference to it", inProcessNamespaceType)
	}
	targets[namespace] = "kaiten." + inProcessNamespaceType

	targets[inProcessAccessorObject(t, facade)] = fmt.Sprintf(
		"kaiten.(*%s).%s, the accessor for the credential-free surface", facadeAppType, inProcessAccessor)

	// Every struct field whose type is declared in one of those packages. Walking
	// all packages rather than the three aggregators is deliberate: a field of this
	// type on some transport-side struct is exactly the leak worth catching, and it
	// would not be on any list a test kept by hand.
	fields := 0
	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		if pkg.Types == nil {
			return
		}
		scope := pkg.Types.Scope()
		for _, name := range scope.Names() {
			structType, ok := scope.Lookup(name).Type().Underlying().(*types.Struct)
			if !ok {
				continue
			}
			for i := range structType.NumFields() {
				field := structType.Field(i)
				owner := declaringPackage(field.Type())
				if owner == nil {
					continue
				}
				if _, credentialFree := inProcessUseCasePkgs[owner.Path()]; !credentialFree {
					continue
				}
				targets[field] = fmt.Sprintf("%s.%s.%s, which holds %s.UseCase",
					shortPkg(pkg.PkgPath), name, field.Name(), shortPkg(owner.Path()))
				fields++
			}
		}
	})

	if fields == 0 {
		t.Fatalf("no struct field anywhere holds one of the %d credential-free use cases -- the module "+
			"aggregators each hold at least one, so finding none means this walk stopped resolving rather "+
			"than that the surface shrank", len(inProcessUseCasePkgs))
	}

	return targets
}

// inProcessAccessorObject resolves the (*Kaiten).InProcess method.
//
// A method rather than a package-level function, so it is not in the package scope
// and has to be found on the type. Failing loudly when it is not there is the point:
// a renamed accessor that resolved to nothing would leave the allowlist watching one
// target instead of two, and passing.
func inProcessAccessorObject(t *testing.T, facade *packages.Package) types.Object {
	t.Helper()

	obj := facade.Types.Scope().Lookup(facadeAppType)
	if obj == nil {
		t.Fatalf("kaiten.%s did not resolve -- the application type was renamed", facadeAppType)
	}
	named, ok := obj.Type().(*types.Named)
	if !ok {
		t.Fatalf("kaiten.%s is not a named type, so its methods cannot be walked", facadeAppType)
	}
	for i := range named.NumMethods() {
		if method := named.Method(i); method.Name() == inProcessAccessor {
			return method
		}
	}
	t.Fatalf("kaiten.(*%s).%s did not resolve -- the accessor for the credential-free surface was renamed "+
		"or removed, and the allowlist below can no longer recognise a call to it",
		facadeAppType, inProcessAccessor)
	return nil
}

// declaringPackage reports the package that declared the named type t points at, or
// names directly, and nil for anything else. Only one level of pointer, because a
// use case is always held as *UseCase and a deeper walk would start reporting the
// packages of unrelated field types.
func declaringPackage(t types.Type) *types.Package {
	if ptr, ok := t.(*types.Pointer); ok {
		t = ptr.Elem()
	}
	named, ok := t.(*types.Named)
	if !ok || named.Obj().Pkg() == nil {
		return nil
	}
	return named.Obj().Pkg()
}

// Fails when a package outside inProcessCallSites names the credential-free
// surface, in any of the three ways it can be named: importing a use case
// package, naming kaiten.InProcess or its accessor, or reading the field a module
// aggregator holds one on.
//
// Everything on this surface runs with no user, no organization and no scopes, so
// a reference from a transport package is an unauthenticated write reachable over
// HTTP. The failure message quotes the admission test, because the fix is almost
// never to widen the list.
func TestInProcessSurfaceIsReferencedOnlyByItsAllowedDrivers(t *testing.T) {
	pkgs := loadModule(t)

	allowed := make(map[string]string, len(inProcessCallSites)+len(inProcessUseCasePkgs))
	for path, why := range inProcessCallSites {
		allowed[path] = why
	}
	// The slices themselves: users/ensureuser composes organization/ensuremembership,
	// and createplatformtoken composes revokeplatformtoken for its --replace path.
	for path := range inProcessUseCasePkgs {
		allowed[path] = "a credential-free use case composing another"
	}

	targets := inProcessTargets(t, pkgs)

	var violations []string
	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		if _, ok := allowed[pkg.PkgPath]; ok {
			return
		}

		for imported := range pkg.Imports {
			if _, dual := dualPublishedUseCasePkgs[imported]; dual {
				// A dual-published slice owns a wire contract, so the package that
				// registers it has to name it. What still cannot be named is the
				// credential-free namespace itself, which the identifier walk below
				// catches regardless of which import got the package into scope.
				continue
			}
			if why, credentialFree := inProcessUseCasePkgs[imported]; credentialFree {
				violations = append(violations, fmt.Sprintf(
					"%s imports %s -- %s",
					pkg.PkgPath, shortPkg(imported), why))
			}
		}

		if pkg.TypesInfo == nil {
			return
		}
		for ident, obj := range pkg.TypesInfo.Uses {
			label, isTarget := targets[obj]
			if !isTarget {
				continue
			}
			// A package naming its own declarations is the declaration, not a reference
			// to it: internal/kaiten spells InProcess in the receiver of all eight
			// methods and in the accessor that returns one. Skipping the declaring
			// package opens no hole -- it is on inProcessCallSites anyway, as the
			// namespace these operations are published on.
			if obj.Pkg() != nil && obj.Pkg().Path() == pkg.PkgPath {
				continue
			}
			violations = append(violations, fmt.Sprintf(
				"%s: package %s references %s",
				pkg.Fset.Position(ident.Pos()), pkg.PkgPath, label))
		}
	})

	if len(violations) > 0 {
		sort.Strings(violations)

		doors := make([]string, 0, len(inProcessCallSites))
		for path, why := range inProcessCallSites {
			doors = append(doors, fmt.Sprintf("  %s -- %s", path, why))
		}
		sort.Strings(doors)

		t.Errorf("found %d reference(s) to the credential-free surface from outside its drivers:\n%s\n\n"+
			"Allowed, and why each one has no credential to act with:\n%s\n\n"+
			"The fix is almost never to add an entry. These operations bind principal.KindUnset -- no user, no "+
			"organization, no scopes -- so a reference from anything that serves a request is an unauthenticated "+
			"write on a public surface. If the caller does hold a credential, the operation it wants is a Platform "+
			"or Core one and belongs behind k.Platform or a module namespace, where a scope is checked.",
			len(violations), strings.Join(violations, "\n"), strings.Join(doors, "\n"))
	}
}

// Fails when one of the credential-free slices acquires the means to appear on
// the wire. Four checks, each ruling out one way an operation gets published: a
// huma or fiber import, an endpoint.go, a *RequiredScope const, and a
// huma.Operation literal.
//
// All four are skipped for a slice on dualPublishedUseCasePkgs, which
// TestDualPublishedUseCasesAreReachedBothWays holds to a stricter standard
// instead.
//
// The last check is the structural form of "no operation ID from these packages
// appears in either document", and the stronger one: an operation reaches a
// document only from an inline huma.Operation literal, which
// TestEveryHumaOperationDeclaresAScope already requires -- so no literal here is
// no entry there, and it cannot be satisfied by forgetting to regenerate.
func TestInProcessUseCasePackagesCannotBePublished(t *testing.T) {
	pkgs := loadModule(t)

	var violations []string
	resolved := 0

	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		if _, credentialFree := inProcessUseCasePkgs[pkg.PkgPath]; !credentialFree {
			return
		}
		resolved++
		if _, dual := dualPublishedUseCasePkgs[pkg.PkgPath]; dual {
			// Counted before it is skipped, so the resolution guard below still fails
			// on a package that was moved or renamed. See dualPublishedUseCasePkgs for
			// what the exemption costs and what pays for it.
			return
		}

		for _, transport := range []string{humaPkg, fiberPkg} {
			if _, imported := pkg.Imports[transport]; imported {
				violations = append(violations, fmt.Sprintf(
					"%s imports %s -- a credential-free use case that speaks a transport's vocabulary is one "+
						"refactor away from being reachable through it",
					shortPkg(pkg.PkgPath), transport))
			}
		}

		for _, file := range pkg.GoFiles {
			if filepath.Base(file) == endpointFile {
				violations = append(violations, fmt.Sprintf(
					"%s contains %s -- absence of one is how this slice declares it has no wire counterpart",
					shortPkg(pkg.PkgPath), endpointFile))
			}
		}

		if pkg.Types == nil {
			return
		}
		for _, name := range pkg.Types.Scope().Names() {
			if strings.HasSuffix(name, requiredScopeSuffix) {
				violations = append(violations, fmt.Sprintf(
					"%s declares %s -- its caller holds no credential, so it carries no scopes and a scope "+
						"check against an empty set would be theatre",
					shortPkg(pkg.PkgPath), name))
			}
		}
	})

	if resolved != len(inProcessUseCasePkgs) {
		t.Fatalf("only %d of the %d credential-free use case packages loaded -- a package on the list was moved "+
			"or renamed, and the checks above ran against nothing; update inProcessUseCasePkgs",
			resolved, len(inProcessUseCasePkgs))
	}

	// The operation-literal check, over the whole tree rather than these packages, so
	// the count doubles as the guard: huma.Operation resolving to something no literal
	// matches would leave the loop below inspecting nothing.
	sites := compositeLiteralSites(pkgs, namedType(t, pkgs, humaPkg, "Operation"))
	if len(sites) < minOperationLiterals {
		t.Fatalf("only found %d huma.Operation literal(s), expected at least %d -- this walk is how the test "+
			"knows what is published, and a count this low means it stopped matching rather than that endpoints "+
			"were deleted", len(sites), minOperationLiterals)
	}
	for _, site := range sites {
		if _, dual := dualPublishedUseCasePkgs[site.pkgPath]; dual {
			continue
		}
		if why, credentialFree := inProcessUseCasePkgs[site.pkgPath]; credentialFree {
			violations = append(violations, fmt.Sprintf(
				"%s: %s declares a huma.Operation, which puts it in an OpenAPI document -- but %s",
				site.pos, shortPkg(site.pkgPath), why))
		}
	}

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d way(s) a credential-free use case could be published:\n%s\n\n"+
			"internal/kaiten/inprocess.go states the admission test for this surface: a transport counterpart "+
			"must be impossible, not merely absent. An operation that can have an endpoint should have one, and "+
			"then it belongs on k.Platform or a module namespace with a scope, not here.",
			len(violations), strings.Join(violations, "\n"))
	}
}

// A method on kaiten.InProcess requires no scope, and runs exactly one
// credential-free use case.
//
// The no-scope direction is not pedantry: these methods take no caller, so a
// method that grew one in order to Require something would mean someone believed
// this surface was authorized -- and the next person would make that true by
// granting the caller scopes, leaving a credentialed surface no OpenAPI document
// describes.
//
// The exactly-one direction keeps a reader able to hold the surface in their head
// as one line per operation. A method running two is a place where the admission
// test was argued for one operation and applied to another.
func TestInProcessFacadeMethodsCheckNoScope(t *testing.T) {
	pkgs := loadModule(t)

	facade := loadedPackage(t, pkgs, facadePkg)
	namespace := namedType(t, pkgs, facadePkg, inProcessNamespaceType)

	var violations []string
	walked := 0

	for _, file := range facade.Syntax {
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Recv == nil || fn.Body == nil || !fn.Name.IsExported() {
				continue
			}
			if !hasReceiverType(facade.TypesInfo, fn, namespace) {
				continue
			}
			walked++

			label := methodLabel(fn)
			pos := facade.Fset.Position(fn.Pos())
			scopes, executes := scopeAndExecuteTargets(facade.TypesInfo, fn.Body)

			for _, pkgPath := range sortedKeys(scopes) {
				violations = append(violations, fmt.Sprintf(
					"%s: %s requires a %s from %s, but an in-process caller carries no scopes -- the check can "+
						"only ever refuse",
					pos, label, requiredScopeSuffix, shortPkg(pkgPath)))
			}

			switch len(executes) {
			case 1:
				for _, pkgPath := range sortedKeys(executes) {
					if _, credentialFree := inProcessUseCasePkgs[pkgPath]; !credentialFree {
						violations = append(violations, fmt.Sprintf(
							"%s: %s runs %s.Execute, which is not one of the credential-free use cases -- an "+
								"operation reached without a credential must be one that could not have "+
								"required one",
							pos, label, shortPkg(pkgPath)))
					}
				}
			case 0:
				violations = append(violations, fmt.Sprintf(
					"%s: %s takes an in-process caller but runs no use case -- a method on this surface exists "+
						"to run exactly one",
					pos, label))
			default:
				violations = append(violations, fmt.Sprintf(
					"%s: %s runs %d use cases (%s) -- one method per operation, so the admission test is argued "+
						"and applied for the same thing",
					pos, label, len(executes), strings.Join(sortedKeys(executes), ", ")))
			}
		}
	}

	if walked < minInProcessFacadeMethods {
		t.Fatalf("only %d exported method(s) are declared on kaiten.%s, expected at least %d -- the walk is "+
			"matching nothing and this test is passing vacuously; if an operation was removed, lower the floor "+
			"deliberately", walked, inProcessNamespaceType, minInProcessFacadeMethods)
	}

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d problem(s) on the credential-free facade surface:\n%s",
			len(violations), strings.Join(violations, "\n"))
	}
}

// Fails when a package allowed only to *pass along* the credential-free surface
// calls an operation on it. For a transport package the honest answer to "may it
// name the surface" is "only to wire it", and the line between wiring and calling
// is the only thing between that value and an unauthenticated write reachable
// over HTTP.
//
// Every method on the namespace is a target, discovered from the type, so an
// operation added to the surface is covered without editing this test.
func TestInProcessWiringPackagesNeverInvokeTheSurface(t *testing.T) {
	pkgs := loadModule(t)

	facade := loadedPackage(t, pkgs, facadePkg)
	obj := facade.Types.Scope().Lookup(inProcessNamespaceType)
	if obj == nil {
		t.Fatalf("kaiten.%s did not resolve -- the credential-free namespace was renamed", inProcessNamespaceType)
	}
	named, ok := obj.Type().(*types.Named)
	if !ok {
		t.Fatalf("kaiten.%s is not a named type, so its methods cannot be walked", inProcessNamespaceType)
	}

	operations := map[types.Object]string{}
	for i := range named.NumMethods() {
		method := named.Method(i)
		operations[method] = fmt.Sprintf("kaiten.%s.%s", inProcessNamespaceType, method.Name())
	}
	if len(operations) < minInProcessFacadeMethods {
		t.Fatalf("kaiten.%s has %d method(s), expected at least %d -- this walk is how the test knows what "+
			"invoking the surface looks like, and a count this low means it stopped resolving",
			inProcessNamespaceType, len(operations), minInProcessFacadeMethods)
	}

	var violations []string
	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		why, wiringOnly := inProcessWiringOnlyPkgs[pkg.PkgPath]
		if !wiringOnly || pkg.TypesInfo == nil {
			return
		}
		for ident, used := range pkg.TypesInfo.Uses {
			if label, isOperation := operations[used]; isOperation {
				violations = append(violations, fmt.Sprintf(
					"%s: %s calls %s -- %s",
					pkg.Fset.Position(ident.Pos()), pkg.PkgPath, label, why))
			}
		}
	})

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d invocation(s) of the credential-free surface from a package allowed only to wire "+
			"it:\n%s\n\nThese packages appear in inProcessCallSites because the object graph has to be "+
			"assembled somewhere. Assembling it is not the same permission as running an operation with no user, "+
			"no organization and no scopes. If the operation is genuinely needed here, it is needed with a "+
			"credential -- which means it belongs on k.Platform or a module namespace, where a scope is checked.",
			len(violations), strings.Join(violations, "\n"))
	}
}

// The obligation dualPublishedUseCasePkgs takes on for its exemption: a slice
// claiming to be asked from both sides of the credential line must be reached
// from both, and each half must behave like the surface it is on.
//
//  1. it is a credential-free slice as well -- otherwise the entry exempts a
//     package from checks that were never going to run on it;
//  2. it declares exactly one RequiredScope, so "which scope guards this" has a
//     single answer;
//  3. it contains endpoint.go -- a slice with no endpoint is simply unpublished,
//     which the exemption must never cover;
//  4. exactly one method on kaiten.InProcess runs it, naming no scope;
//  5. exactly one method on kaiten.Platform runs it, naming its RequiredScope.
//
// 4 and 5 are the real content: the two halves exist, they front the same
// operation, and only the credentialed one checks anything. A slice that lost its
// InProcess half should leave this list and be an ordinary published operation;
// one that lost its Platform half should give up its endpoint.
func TestDualPublishedUseCasesAreReachedBothWays(t *testing.T) {
	if len(dualPublishedUseCasePkgs) == 0 {
		t.Skip("no dual-published slices; nothing to pair")
	}

	pkgs := loadModule(t)
	facade := loadedPackage(t, pkgs, facadePkg)

	inProcessRuns := useCaseRunners(t, facade, namedType(t, pkgs, facadePkg, inProcessNamespaceType))
	platformRuns := useCaseRunners(t, facade, namedType(t, pkgs, facadePkg, platformNamespaceType))

	var violations []string
	for _, pkgPath := range sortedKeys(dualPublishedUseCasePkgs) {
		slice := loadedPackage(t, pkgs, pkgPath)
		short := shortPkg(pkgPath)

		if _, credentialFree := inProcessUseCasePkgs[pkgPath]; !credentialFree {
			violations = append(violations, fmt.Sprintf(
				"%s is dual-published but is not on inProcessUseCasePkgs -- there is no credential-free half "+
					"for the exemption to be about, so it exempts nothing and only reads as though it did",
				short))
		}

		var scopes []string
		for _, name := range slice.Types.Scope().Names() {
			if strings.HasSuffix(name, requiredScopeSuffix) {
				scopes = append(scopes, name)
			}
		}
		if len(scopes) != 1 {
			violations = append(violations, fmt.Sprintf(
				"%s declares %d %s (%s), expected exactly 1 -- its credentialed half authorizes one operation, "+
					"so there is one scope to name and one place that names it",
				short, len(scopes), requiredScopeSuffix, strings.Join(scopes, ", ")))
		}

		published := false
		for _, file := range slice.GoFiles {
			if filepath.Base(file) == endpointFile {
				published = true
			}
		}
		if !published {
			violations = append(violations, fmt.Sprintf(
				"%s is dual-published but has no %s -- the exemption is for a slice that IS on the wire, never "+
					"for one that merely could be",
				short, endpointFile))
		}

		violations = append(violations,
			pairingViolations(pkgPath, "kaiten."+inProcessNamespaceType, inProcessRuns[pkgPath], false)...)
		violations = append(violations,
			pairingViolations(pkgPath, "kaiten."+platformNamespaceType, platformRuns[pkgPath], true)...)
	}

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d problem(s) with the dual-published slices:\n%s\n\n"+
			"A slice on dualPublishedUseCasePkgs is exempt from the purity checks in "+
			"TestInProcessUseCasePackagesCannotBePublished, and this is what it owes for that: one half on each "+
			"namespace, running the same operation, with the scope check on the half that has a credential to "+
			"check it against.",
			len(violations), strings.Join(violations, "\n"))
	}
}

// runner is one facade method that runs a use case: its label, and the packages whose
// RequiredScope it names.
type runner struct {
	label  string
	scopes map[string]bool
}

// useCaseRunners maps each use case package to the methods on one facade
// namespace that run it. A slice per package rather than one value, because
// "exactly one method fronts this operation" is asserted rather than assumed, and
// a map keeping the last of two would lose the evidence.
//
// Fails when the namespace has no methods at all: a walk resolving nothing would
// report every dual-published slice as unpaired, sending the next reader to look
// at the slice instead of at the walk.
func useCaseRunners(t *testing.T, facade *packages.Package, namespace types.Type) map[string][]runner {
	t.Helper()

	runners := map[string][]runner{}
	methods := 0

	for _, file := range facade.Syntax {
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Recv == nil || fn.Body == nil || !fn.Name.IsExported() {
				continue
			}
			if !hasReceiverType(facade.TypesInfo, fn, namespace) {
				continue
			}
			methods++

			scopes, executes := scopeAndExecuteTargets(facade.TypesInfo, fn.Body)
			for pkgPath := range executes {
				runners[pkgPath] = append(runners[pkgPath], runner{label: methodLabel(fn), scopes: scopes})
			}
		}
	}

	if methods == 0 {
		t.Fatalf("no exported method resolved on %s -- the walk over the facade stopped matching, so every "+
			"pairing below would fail for that reason rather than for a real one", namespace)
	}
	return runners
}

// pairingViolations reports what is wrong with the methods on one namespace that run
// one slice: that there is not exactly one, or that its scope checking does not match
// the namespace it is on.
//
// wantScope is the whole asymmetry. On the credentialed namespace the method must
// name the slice's own scope and nothing else; on the credential-free one it must
// name none, because its caller carries none and a check against an empty set would
// refuse every call or, worse, be written so it does not.
func pairingViolations(pkgPath, namespace string, runners []runner, wantScope bool) []string {
	short := shortPkg(pkgPath)

	if len(runners) != 1 {
		labels := make([]string, 0, len(runners))
		for _, r := range runners {
			labels = append(labels, r.label)
		}
		sort.Strings(labels)
		return []string{fmt.Sprintf(
			"%s is run by %d method(s) on %s (%s), expected exactly 1 -- a dual-published slice is one "+
				"operation reached two ways, so each namespace fronts it once",
			short, len(runners), namespace, strings.Join(labels, ", "))}
	}

	only := runners[0]
	switch {
	case wantScope && len(only.scopes) == 0:
		return []string{fmt.Sprintf(
			"%s: runs %s but requires no scope -- on a credentialed namespace that is an operation anyone "+
				"holding any credential may call, and the document still advertises a scope",
			only.label, short)}
	case wantScope && (len(only.scopes) != 1 || !only.scopes[pkgPath]):
		return []string{fmt.Sprintf(
			"%s: runs %s but requires %s -- the scope it enforces and the operation it runs have to be the "+
				"same one",
			only.label, short, strings.Join(sortedKeys(only.scopes), ", "))}
	case !wantScope && len(only.scopes) > 0:
		return []string{fmt.Sprintf(
			"%s: runs %s and requires %s, but its caller carries no scopes -- a check here can only ever "+
				"refuse, and someone will make it pass by granting the caller scopes",
			only.label, short, strings.Join(sortedKeys(only.scopes), ", "))}
	}
	return nil
}
