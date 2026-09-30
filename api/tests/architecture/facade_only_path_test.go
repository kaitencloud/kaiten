// This file pins what the rest of this directory takes for granted: that
// between a driver and a use case there is exactly one path, and it goes
// through internal/kaiten.
package architecture_test

import (
	"fmt"
	"go/ast"
	"go/types"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"

	"golang.org/x/tools/go/packages"
)

// handlerFile holds a use case's own logic: the rules, the repository calls, the
// events. It is the file that must read the same whether the caller arrived over
// HTTP, over gRPC, or from another Go function.
const handlerFile = "handler.go"

// transportPackages is what "speaks a transport" means here: the two frameworks
// and the in-house wrapper around huma. A file naming any of these has a shape only
// one driver can satisfy.
//
// There was a fiber wrapper too, holding the scope middleware the OFREP routes
// used. Enforcement moving to the facade emptied it, so it is gone; the frameworks
// themselves are what a handler must not name, and both are still listed.
var transportPackages = []string{humaPkg, fiberPkg, kaitenHumaPkg}

// Floors for the two file populations below: 112 handler.go and 99 endpoint.go
// today. Both walks find their subjects by filename, so a rename or a moved
// directory would leave them checking an empty set -- these turn that into a
// failure instead of a pass.
const (
	minModuleHandlerFiles  = 95
	minModuleEndpointFiles = 85
)

// minFacadeUseCasePackages floors the positive control in
// TestNoEndpointRunsAUseCaseDirectly. The facade runs every published operation,
// so the same detector that must find nothing in endpoint.go must find nearly a
// hundred packages there.
const minFacadeUseCasePackages = 80

// moduleFilesNamed collects the parsed files under internal/modules whose base
// name is exactly name, paired with the package that holds them.
func moduleFilesNamed(pkgs []*packages.Package, name string) []struct {
	pkg  *packages.Package
	file *ast.File
} {
	var found []struct {
		pkg  *packages.Package
		file *ast.File
	}

	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		if !strings.HasPrefix(pkg.PkgPath, modulesPrefix) {
			return
		}
		for _, file := range pkg.Syntax {
			if filepath.Base(pkg.Fset.Position(file.Pos()).Filename) != name {
				continue
			}
			found = append(found, struct {
				pkg  *packages.Package
				file *ast.File
			}{pkg: pkg, file: file})
		}
	})

	return found
}

// TestModuleHandlersNameNoTransport is the negative half of commit 7's argument:
// having moved registration out of the module layer, nothing in a handler should
// still name huma or fiber.
//
// It matters beyond tidiness. handler.go is where a use case's rules live, and a
// huma import there is what made "this operation is HTTP" a property of the
// domain layer instead of the driver: 98 of these files took a huma.API
// parameter purely to register an endpoint they also implemented, which is why
// there was no second way to call any of them. A file that names a transport
// again is a file that will grow a second RegisterAPI.
//
// Transport imports that legitimately remain under internal/modules, none of
// them in a handler.go:
//
//   - the 99 endpoint.go files and OFREP's two endpoint_openapi.go, which are
//     the HTTP driver, colocated on purpose;
//   - three huma.SchemaProvider implementations (licenses, instances,
//     featureflags schema packages), which huma's Registry offers no other hook
//     for;
//   - featureflags.RegisterFeatureFlagSchemas and the two RegisterWebhook
//     functions, which write into the OpenAPI document rather than serve a
//     request -- documentation, not behaviour.
func TestModuleHandlersNameNoTransport(t *testing.T) {
	pkgs := loadModule(t)
	handlers := moduleFilesNamed(pkgs, handlerFile)

	var violations []string
	for _, handler := range handlers {
		for _, imp := range handler.file.Imports {
			importPath, err := strconv.Unquote(imp.Path.Value)
			if err != nil {
				continue
			}
			for _, transport := range transportPackages {
				if importPath != transport && !strings.HasPrefix(importPath, transport+"/") {
					continue
				}
				violations = append(violations, fmt.Sprintf(
					"%s: %s/%s imports %q -- move whatever needs it into endpoint.go, which is where this slice "+
						"is allowed to know it is served over HTTP",
					handler.pkg.Fset.Position(imp.Pos()), shortPkg(handler.pkg.PkgPath), handlerFile, importPath))
			}
		}
	}

	if len(handlers) < minModuleHandlerFiles {
		t.Fatalf("only %d %s file(s) found under internal/modules, expected at least %d -- this walk selects by "+
			"filename, so a count this low means it is checking almost nothing",
			len(handlers), handlerFile, minModuleHandlerFiles)
	}

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d handler(s) naming a transport:\n%s", len(violations), strings.Join(violations, "\n"))
	}
}

// facadeExemptEndpoints are the endpoint.go files allowed to reach their use
// case directly, with the reason each one is. There is one, and internal/kaiten
// says why in two places (serviceaccounts.go and container.go) rather than
// leaving it to be discovered here.
//
// The admission test is narrow enough to be worth stating: an operation is
// exempt only if there is no caller to hand it, because producing one is what
// the operation is for. That is true of authentication and of nothing else. An
// operation that merely has no credential yet takes no caller at all and
// belongs on k.InProcess.
//
// identity/validateplatformtoken is the other half of that admission and is
// absent from this map on purpose: it authenticates the `ksm_` family exactly as
// validatetoken authenticates `ksh_`, but it has no endpoint.go to exempt. Its
// caller is auth.PlatformMiddleware, which this walk does not look at because a
// middleware is not an endpoint. Both are named in internal/kaiten's doc.
var facadeExemptEndpoints = map[string]string{
	modulesPrefix + "identity/validatetoken": "the ext_authz check Envoy calls to exchange a `ksh_` token for " +
		"the internal JWT every other route requires -- it authenticates rather than acts, so there is no caller " +
		"to take, and requiring a scope here would be circular (it is in publicFiberRoutes for the same reason)",
}

// TestNoEndpointRunsAUseCaseDirectly is the other half: an endpoint that calls
// UseCase.Execute has bypassed the facade, and with it the scope check.
func TestNoEndpointRunsAUseCaseDirectly(t *testing.T) {
	pkgs := loadModule(t)
	endpoints := moduleFilesNamed(pkgs, endpointFile)

	var violations []string
	exemptionsUsed := map[string]bool{}
	for _, endpoint := range endpoints {
		if endpoint.pkg.TypesInfo == nil {
			continue
		}
		_, executes := scopeAndExecuteTargets(endpoint.pkg.TypesInfo, endpoint.file)
		for _, target := range sortedKeys(executes) {
			if _, exempt := facadeExemptEndpoints[endpoint.pkg.PkgPath]; exempt {
				exemptionsUsed[endpoint.pkg.PkgPath] = true
				continue
			}
			violations = append(violations, fmt.Sprintf(
				"%s/%s calls a %s method of %s -- call the facade method for this operation instead; reaching "+
					"Execute skips the scope check that only the facade performs",
				shortPkg(endpoint.pkg.PkgPath), endpointFile, useCaseTypeName, shortPkg(target)))
		}
	}

	// An exemption that no longer applies is worse than none: it reads as a
	// standing licence for a file that has stopped needing it.
	for _, exempt := range sortedKeys(facadeExemptEndpoints) {
		if !exemptionsUsed[exempt] {
			violations = append(violations, fmt.Sprintf(
				"%s is exempt from this rule but no longer reaches its use case directly -- delete the entry from "+
					"facadeExemptEndpoints so the rule applies to it like everything else", repoRelative(exempt)))
		}
	}

	if len(endpoints) < minModuleEndpointFiles {
		t.Fatalf("only %d %s file(s) found under internal/modules, expected at least %d -- this walk selects by "+
			"filename, so a count this low means it is checking almost nothing",
			len(endpoints), endpointFile, minModuleEndpointFiles)
	}

	// The positive control, and the reason a pass here means something: the
	// detector above finds Execute calls by resolving a method's receiver to a
	// named UseCase type, so a rename of that type would make it match nothing
	// and every endpoint would look clean. The facade is where it must match --
	// it runs all 100 operations -- so calibrate on that.
	facade := loadedPackage(t, pkgs, facadePkg)
	fronted := map[string]bool{}
	for _, file := range facade.Syntax {
		_, executes := scopeAndExecuteTargets(facade.TypesInfo, file)
		for target := range executes {
			fronted[target] = true
		}
	}
	if len(fronted) < minFacadeUseCasePackages {
		t.Fatalf("the walk found %s calls into only %d use case package(s) from %s, expected at least %d -- it is "+
			"no longer recognising them, so its silence about endpoint.go proves nothing",
			useCaseTypeName, len(fronted), shortPkg(facadePkg), minFacadeUseCasePackages)
	}

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("found %d endpoint(s) bypassing the facade:\n%s", len(violations), strings.Join(violations, "\n"))
	}
}

// storageConstructors are the packages that hand out something a statement can
// run on. A driver importing one of these can execute SQL without importing any
// module's infrastructure package, which is the gap this leaves in
// TestModuleBoundaries_NoCrossModuleRepositoryAccess's third rule.
var storageConstructors = []string{
	"github.com/jackc/pgx/v5",
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow",
}

// TestJITProvisionsThroughAPortItDeclares pins the shape of the one caller that
// cannot use a credential.
func TestJITProvisionsThroughAPortItDeclares(t *testing.T) {
	pkgs := loadModule(t)
	jit := loadedPackage(t, pkgs, jitPkg)

	var violations []string

	for importPath := range jit.Imports {
		if importPath == facadePkg || strings.HasPrefix(importPath, facadePkg+"/") {
			violations = append(violations, fmt.Sprintf(
				"imports %s -- declare the two methods it needs as an interface here and let cmd/server pass "+
					"k.InProcess, so this package depends on a behaviour it names rather than on the composition root",
				repoRelative(facadePkg)))
		}
		for _, storage := range storageConstructors {
			if importPath == storage || strings.HasPrefix(importPath, storage+"/") {
				violations = append(violations, fmt.Sprintf(
					"imports %q -- provisioning here is the use cases' job now; a connection or a unit of work in "+
						"this package is the inlined upsert coming back", importPath))
			}
		}
	}

	// The port: an interface declared in this package whose methods take a Command
	// from one of the credential-free use cases. That vocabulary is the marker now
	// that the methods take no caller -- and it is the more direct one, because it
	// names the operations the port is allowed to reach rather than a token that
	// gated none of them. Finding exactly one interface is the assertion -- a second
	// would mean the surface had been split and one half could drift.
	ports := map[string]int{}
	for _, file := range jit.Syntax {
		ast.Inspect(file, func(n ast.Node) bool {
			spec, ok := n.(*ast.TypeSpec)
			if !ok {
				return true
			}
			iface, ok := spec.Type.(*ast.InterfaceType)
			if !ok {
				return true
			}
			credentialFreeMethods := 0
			for _, method := range iface.Methods.List {
				fn, ok := method.Type.(*ast.FuncType)
				if !ok || fn.Params == nil {
					continue
				}
				for _, param := range fn.Params.List {
					owner := declaringPackage(types.Unalias(jit.TypesInfo.TypeOf(param.Type)))
					if owner == nil {
						continue
					}
					if _, credentialFree := inProcessUseCasePkgs[owner.Path()]; credentialFree {
						credentialFreeMethods++
						break
					}
				}
			}
			if credentialFreeMethods > 0 {
				ports[spec.Name.Name] = credentialFreeMethods
			}
			return true
		})
	}

	switch len(ports) {
	case 1:
		for name, methods := range ports {
			if methods < 2 {
				violations = append(violations, fmt.Sprintf(
					"the port %q declares %d method(s) speaking a credential-free use case's vocabulary -- JIT "+
						"provisions both an organization and a user, so a port this small means one of them is "+
						"being done some other way", name, methods))
			}
		}
	case 0:
		violations = append(violations,
			"no interface in this package has a method taking a credential-free use case's Command -- either "+
				"provisioning stopped going through that surface, or the port moved somewhere this package now "+
				"imports instead of declaring")
	default:
		violations = append(violations, fmt.Sprintf(
			"%d interfaces here speak a credential-free use case's vocabulary (%s) -- one port, so there is one "+
				"place to read what provisioning is allowed to do",
			len(ports), strings.Join(sortedKeys(ports), ", ")))
	}

	if len(violations) > 0 {
		sort.Strings(violations)
		t.Errorf("%s does not hold its side of the provisioning contract:\n  %s",
			repoRelative(jitPkg), strings.Join(violations, "\n  "))
	}
}
