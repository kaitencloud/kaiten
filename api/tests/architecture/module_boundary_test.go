// Package architecture_test contains fitness-function tests that enforce
// architectural rules by walking the real Go import graph (via go/packages
// and go/types), rather than relying on code review to catch drift.
//
// This file guards one class of violation: a module constructing and calling
// another module's repository types directly, reaching past that module's own
// business rules -- slug validation, entitlement enforcement, event emission --
// to fake atomicity. The sanctioned shape is a consumer-owned interface
// (upsertintegration/ports.go) satisfied by the other module's exported UseCase
// methods.
//
// The same rule covers the drivers -- cmd/**, internal/kaiten,
// internal/platform/jit -- because the shape has an instance outside
// internal/modules that a modules-only walk cannot see: a command running another
// module's statements straight from cmd/.
package architecture_test

import (
	"fmt"
	"go/ast"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"

	"golang.org/x/tools/go/packages"
)

// Caching: this test discovers what it checks at runtime through go/packages,
// so nothing it reads is a compiled dependency of the test binary and editing one
// does not change this package's build ID. A stale cached PASS can therefore
// outlive a real violation. Rerun with -count=1 after touching cross-module
// imports. (Blank-importing the composition roots to create a real dependency
// edge was tried and still served a stale PASS.)

// modulesMarker is the path segment every module-scoped package lives under.
// It shows up both in real import paths (e.g.
// "github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer")
// and in on-disk file paths reported by go/packages, so a single helper can
// derive the owning module name from either.
const modulesMarker = "/internal/modules/"

// apiModulePrefix is the import-path prefix every package in this Go module
// shares. Derived from the load pattern rather than written out again, so the
// two cannot drift.
var apiModulePrefix = strings.TrimSuffix(allPackagesPattern, "...")

// repoRelative shortens an import path for a failure message: the module
// prefix is the same on every line and carries no information.
func repoRelative(pkgPath string) string {
	return strings.TrimPrefix(pkgPath, apiModulePrefix)
}

// moduleInfrastructurePattern matches a module's infrastructure packages --
// infrastructure/db (sqlc output), infrastructure/dbmap (row-to-DTO mapping),
// and anything else a module puts there. The directory is the module's answer
// to "how is this stored", which is the part of a module nothing outside it
// gets to depend on.
var moduleInfrastructurePattern = regexp.MustCompile(`/internal/modules/[^/]+/infrastructure(/|$)`)

// storageFreeDrivers are the packages that reach use cases without being one:
// they hold no rows, run no statements, and must go through the facade like
// any other caller. Each is listed with the reason it is here, because the
// reason is what a failure message has to say.
//
// The list is prefixes: a package qualifies if its import path is the prefix
// or sits under it.
var storageFreeDrivers = []struct {
	prefix string
	why    string
}{
	{
		prefix: apiModulePrefix + "cmd",
		why: "a command-line entry point is a driver, and the whole argument for routing it through " +
			"internal/kaiten is that it stops being a second door into the database -- an sqlc import here " +
			"reopens it, and the invariants, outbox events and audit rows that the use case owns are skipped " +
			"exactly as they were before (see cmd/admin-tools' own history: \"one query, two entry points\")",
	},
	{
		prefix: facadePkg,
		why: "the facade composes use cases and binds callers; a row type in here would mean it had started " +
			"doing a repository's job, and the layer that exists to be transport-and-storage-neutral would " +
			"have picked a storage",
	},
	{
		prefix: jitPkg,
		why: "JIT provisioning used to hold its own upsert SQL, which is why ensureorganization and ensureuser " +
			"exist; it now names a two-method port it declares itself and nothing else",
	},
}

// moduleOf extracts the top-level module name from a path that contains
// modulesMarker -- e.g. ".../internal/modules/customers/createcustomer" (an
// import path) or "/repo/api/internal/modules/customers/createcustomer/handler.go"
// (a filesystem path) both yield "customers". Returns "" if the path isn't
// under internal/modules at all (e.g. stdlib, third-party deps, or this
// test's own package).
func moduleOf(path string) string {
	idx := strings.Index(path, modulesMarker)
	if idx < 0 {
		return ""
	}
	rest := path[idx+len(modulesMarker):]
	if i := strings.IndexByte(rest, '/'); i >= 0 {
		return rest[:i]
	}
	return rest
}

// isStorePackage reports whether importPath's own directory is literally
// named "store" (e.g. internal/modules/integrations/store). Such packages
// exist purely to hold a module's persistence details and have no sanctioned
// public surface at all -- unlike a leaf use-case package, which mixes
// UseCase/Command (sanctioned) with CommandRepository/QueryRepository
// (forbidden) in the same package. So any cross-module import of a "store"
// package is forbidden outright, regardless of which identifier is used.
func isStorePackage(importPath string) bool {
	if i := strings.LastIndexByte(importPath, '/'); i >= 0 {
		return importPath[i+1:] == "store"
	}
	return importPath == "store"
}

// isRepositoryIdentifier reports whether name denotes a persistence type or
// constructor other modules must not reach into directly. Every such identifier
// in a leaf use-case package ends in "Repository"; nothing on the sanctioned
// surface -- UseCase, NewUseCase, Command, Execute, EnforceCreationLimit, and the
// module's schema/events types -- does.
func isRepositoryIdentifier(name string) bool {
	return strings.HasSuffix(name, "Repository")
}

// boundaryScope is what this test knows about a package it walks: the name a
// failure message should use for it, the module that owns it ("" for a driver),
// and -- for a driver -- why it is required to be storage-free.
type boundaryScope struct {
	label  string
	module string
	why    string
}

// isDriver reports whether this scope is one of the storage-free drivers rather
// than a package inside a module.
func (s boundaryScope) isDriver() bool { return s.module == "" }

// boundaryScopeOf classifies a package: a module package, one of the
// storage-free drivers, or out of scope. Out of scope is the common answer --
// loadModule walks the whole import graph, so most packages reaching this
// function are stdlib or third-party.
func boundaryScopeOf(pkgPath string) (boundaryScope, bool) {
	if module := moduleOf(pkgPath); module != "" {
		return boundaryScope{label: fmt.Sprintf("module %q", module), module: module}, true
	}
	for _, driver := range storageFreeDrivers {
		if pkgPath == driver.prefix || strings.HasPrefix(pkgPath, driver.prefix+"/") {
			return boundaryScope{label: repoRelative(pkgPath), why: driver.why}, true
		}
	}
	return boundaryScope{}, false
}

// minBoundaryModulePackages floors the module half of the walk. There are 206
// packages under internal/modules today; the floor sits far enough below that
// deleting a slice does not trip it, and a count under it means the walk found
// nothing to check rather than that the modules went away.
const minBoundaryModulePackages = 180

// TestModuleBoundaries_NoCrossModuleRepositoryAccess fails the build when a
// package reaches into persistence that is not its own.
//
//   - Inside internal/modules: a package under module A must not touch module
//     B's persistence -- a package named "store", or a Command/QueryRepository
//     exported from one of B's leaf use-case packages. Cross-module imports in
//     general are fine: a leaf package's UseCase, NewUseCase, Command, Execute,
//     EnforceCreationLimit and a module's schema/events packages are the
//     sanctioned surface, and composing use cases across modules uses them.
//   - For the storage-free drivers (cmd/**, internal/kaiten,
//     internal/platform/jit): the same, plus no module infrastructure/ package
//     at all. A driver owns no module, so it has no reading of "my own rows".
//
// That third rule is drivers-only because five cross-module infrastructure
// imports remain inside internal/modules, four of them metadatafields'
// resource-type enum used as shared vocabulary. Folding them in means either an
// allowlist -- which this file exists to avoid -- or a ~40-file retyping.
// internal/seeder is likewise not a driver here: it keeps Pool() and Exec() for
// the reads and synthetic-timeline writes no use case covers.
func TestModuleBoundaries_NoCrossModuleRepositoryAccess(t *testing.T) {
	pkgs := loadModule(t)

	violations := map[string]struct{}{}
	modulePackages := 0
	driversMatched := map[string]bool{}

	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		scope, inScope := boundaryScopeOf(pkg.PkgPath)
		if !inScope {
			return
		}
		if scope.isDriver() {
			for _, driver := range storageFreeDrivers {
				if pkg.PkgPath == driver.prefix || strings.HasPrefix(pkg.PkgPath, driver.prefix+"/") {
					driversMatched[driver.prefix] = true
				}
			}
		} else {
			modulePackages++
		}

		for _, file := range pkg.Syntax {
			for _, imp := range file.Imports {
				importPath, err := strconv.Unquote(imp.Path.Value)
				if err != nil {
					continue
				}
				pos := pkg.Fset.Position(imp.Pos())

				// Rule 1: an import of a package literally named "store" that
				// this package does not own is forbidden outright, independent
				// of what it uses from it.
				importedModule := moduleOf(importPath)
				if importedModule != "" && importedModule != scope.module && isStorePackage(importPath) {
					violations[fmt.Sprintf(
						"%s: %s imports %q (module %q) -- packages literally named \"store\" hold a module's private persistence details and must never be imported from outside the module that owns them",
						pos, scope.label, repoRelative(importPath), importedModule,
					)] = struct{}{}
				}

				// Rule 3: a driver imports no module's infrastructure/ at all.
				if scope.isDriver() && moduleInfrastructurePattern.MatchString(importPath) {
					violations[fmt.Sprintf(
						"%s: %s imports %q -- %s",
						pos, scope.label, repoRelative(importPath), scope.why,
					)] = struct{}{}
				}
			}

			// Rule 2: a reference to a Command/QueryRepository (or
			// similarly-named) identifier owned elsewhere is forbidden, even
			// though importing the rest of that package (UseCase, NewUseCase,
			// Command, Execute, EnforceCreationLimit, schema/events) is the
			// sanctioned pattern. We inspect actual identifier usage rather
			// than the import list, because a single leaf package (e.g.
			// createcustomer) legitimately exports both the sanctioned
			// UseCase surface and its own CommandRepository -- only the
			// latter is off-limits to everyone else.
			ast.Inspect(file, func(n ast.Node) bool {
				sel, ok := n.(*ast.SelectorExpr)
				if !ok {
					return true
				}
				// Uses (as opposed to Selections) is what go/types populates
				// for qualified identifiers of the form pkg.Name -- exactly
				// the shape of a cross-package reference to an exported type
				// or constructor. Method/field selectors on ordinary values
				// (e.g. h.deps.CustomerCreator.Execute(...)) are recorded in
				// Selections instead and are correctly ignored here.
				obj := pkg.TypesInfo.Uses[sel.Sel]
				if obj == nil || obj.Pkg() == nil {
					return true
				}
				definingModule := moduleOf(obj.Pkg().Path())
				if definingModule == "" || definingModule == scope.module {
					return true // not module-scoped, or same-module (allowed)
				}
				if isRepositoryIdentifier(sel.Sel.Name) {
					pos := pkg.Fset.Position(sel.Pos())
					violations[fmt.Sprintf(
						"%s: %s references %s.%s, a persistence type owned by module %q -- depend on its UseCase/Execute/Command surface instead (see internal/modules/integrations/upsertintegration/ports.go for the sanctioned pattern)",
						pos, scope.label, sel.X, sel.Sel.Name, definingModule,
					)] = struct{}{}
				}
				return true
			})
		}
	})

	if modulePackages < minBoundaryModulePackages {
		t.Fatalf("only %d package(s) under internal/modules were walked, expected at least %d -- moduleOf is no "+
			"longer recognising module paths, so the rules above ran against almost nothing",
			modulePackages, minBoundaryModulePackages)
	}
	for _, driver := range storageFreeDrivers {
		if !driversMatched[driver.prefix] {
			t.Fatalf("no loaded package matched the storage-free driver prefix %q -- it was moved or renamed, and "+
				"nothing checked it; update storageFreeDrivers", repoRelative(driver.prefix))
		}
	}

	if len(violations) == 0 {
		return
	}

	sorted := make([]string, 0, len(violations))
	for v := range violations {
		sorted = append(sorted, v)
	}
	sort.Strings(sorted)
	t.Fatalf("found %d module-boundary violation(s):\n%s", len(sorted), strings.Join(sorted, "\n"))
}
