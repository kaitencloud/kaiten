// The tests here bound the one door that goes around the facade rather than through
// it: kaiten.Modules, the handoff that lets a driver reach a use case's Execute
// directly.
//
// internal/kaiten/container.go calls that handoff TRANSITIONAL and says "nothing new
// should be built on this". Until now nothing enforced it, and the difference matters
// more here than for most comments. A driver reaching
// app.Modules().Components.CreateComponent.Execute(ctx, cmd) does not merely skip a
// scope check -- it also skips bindOrganization, so the use case runs against
// whatever principal the context already carried. That is precisely the second door
// internal/kaiten/doc.go says the package exists to close, left ajar by the package
// that closed it.
//
// So: an allowlist of who may open it, and a CEILING on how wide it is. Every other
// count in this directory is a floor, because everything else should grow as the
// facade covers more. This one is the mirror image -- container.go says "removing a
// field is what progress looks like", and a ceiling is that sentence as a build
// failure rather than a hope.
package architecture_test

import (
	"fmt"
	"go/types"
	"sort"
	"strings"
	"testing"

	"golang.org/x/tools/go/packages"
)

// modulesHandoffType is the exported struct a driver receives, and modulesAccessor
// the method on *Kaiten that hands one out.
const (
	modulesHandoffType = "Modules"
	modulesAccessor    = "Modules"
)

// modulesCallSites are the packages allowed to reach a use case without going
// through a facade method, with the reason each one still does -- and, for the ones
// that are temporary, what has to happen for the entry to go.
//
// Two of the three are permanent and one is not, which is the distinction this map
// exists to keep visible. A reader of container.go cannot tell which fields are
// waiting on a migration and which are load-bearing forever; the answers below say
// so per driver.
var modulesCallSites = map[string]string{
	seederPkg: "TEMPORARY -- seed profiles drive ten modules' use cases directly, which is the only reason " +
		"most fields on the handoff still exist. They go when the seeder takes callers and calls facade " +
		"methods, and that is the single change that shrinks this surface the most",

	apiRegistrationPkg: "PERMANENT for identity.ValidateToken, which authenticates rather than acts and so " +
		"has no caller to take -- a caller is what it produces. It is now the only reason this package is " +
		"here: audittrail left when the CDC fan-out gave it kaiten.Events, which is the facade method the " +
		"entry below used to say it was owed",

	serverPkg: "PERMANENT -- identity.ValidatePlatformToken, the platform half of the same authentication " +
		"exemption, wired into the ext_authz middleware",
}

const apiRegistrationPkg = "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/api"

// maxModulesHandoffFields is a CEILING, and the only one in this directory.
//
// Ten today: Components, Customers, DeploymentZones, Entitlements, FeatureFlags,
// Identity, Instances, Licenses, MetadataFields, Releases.
//
// It was eleven. AuditTrail went when the Dapr subscriber stopped being reached off
// this handoff and started being reached through kaiten.Events, which binds the
// acting principal the way every other surface does -- the migration this ceiling
// exists to make visible, arriving one field at a time.
//
// Lowering it is the deliverable of every migration that removes a direct use case
// call. Raising it is a decision, and the reviewer of that diff is being asked
// whether a new driver genuinely cannot go through a facade method -- which, for
// anything that acts on behalf of somebody, it can. The honest floor for this number
// is two: the two authentication use cases that have no caller to take.
const maxModulesHandoffFields = 10

// TestModulesHandoffIsBoundedAndAllowlisted fails when a package outside
// modulesCallSites reaches a use case through kaiten.Modules, and when the handoff
// itself grows.
//
// The allowlist and the ceiling catch different mistakes. A new package on the
// allowlist is a new driver going around the facade -- visible, and refusable in
// review. A new field with no new package is the subtler one: an existing driver
// reaching one module more than it did, which changes no import and no signature and
// would otherwise land unremarked.
func TestModulesHandoffIsBoundedAndAllowlisted(t *testing.T) {
	pkgs := loadModule(t)

	facade := loadedPackage(t, pkgs, facadePkg)
	handoff := modulesHandoffFields(t, facade)
	accessor := modulesAccessorObject(t, facade)

	var violations []string

	if len(handoff) > maxModulesHandoffFields {
		violations = append(violations, fmt.Sprintf(
			"kaiten.%s has %d fields, ceiling is %d (%s) -- a field here is a use case reachable without a "+
				"scope check and without bindOrganization; if the new driver acts on somebody's behalf, it "+
				"wants a facade method",
			modulesHandoffType, len(handoff), maxModulesHandoffFields, strings.Join(sortedKeys(handoff), ", ")))
	}

	read := map[string]bool{}
	packages.Visit(pkgs, nil, func(pkg *packages.Package) {
		if pkg.TypesInfo == nil || pkg.PkgPath == facadePkg {
			return
		}
		for ident, used := range pkg.TypesInfo.Uses {
			if used == accessor {
				if _, allowed := modulesCallSites[pkg.PkgPath]; !allowed {
					violations = append(violations, fmt.Sprintf(
						"%s: %s calls kaiten.(*%s).%s",
						pkg.Fset.Position(ident.Pos()), pkg.PkgPath, facadeAppType, modulesAccessor))
				}
				continue
			}
			for name, field := range handoff {
				if used == field {
					read[name] = true
				}
			}
		}
	})

	// A field nothing outside the facade reads is a door left open onto an empty
	// room. It costs nothing to notice and it is exactly what gets forgotten after a
	// migration: the consumer moves to a facade method, the field stays, and the
	// ceiling above stops descending even though the work was done.
	for _, name := range sortedKeys(handoff) {
		if !read[name] {
			violations = append(violations, fmt.Sprintf(
				"kaiten.%s.%s is read by nothing outside the facade -- whatever drove it now goes through a "+
					"facade method, so delete the field and lower maxModulesHandoffFields",
				modulesHandoffType, name))
		}
	}

	if len(violations) > 0 {
		sort.Strings(violations)

		doors := make([]string, 0, len(modulesCallSites))
		for path, why := range modulesCallSites {
			doors = append(doors, fmt.Sprintf("  %s -- %s", repoRelative(path), why))
		}
		sort.Strings(doors)

		t.Errorf("found %d problem(s) with the transitional use case handoff:\n%s\n\n"+
			"Allowed today, and why:\n%s\n\n"+
			"internal/kaiten/container.go states the rule this enforces: nothing new should be built on "+
			"kaiten.%s. A driver that needs to reach a use case wants a facade method; if the method does not "+
			"exist yet, adding it is the work, not reaching around it.",
			len(violations), strings.Join(violations, "\n"), strings.Join(doors, "\n"), modulesHandoffType)
	}
}

// modulesHandoffFields returns the handoff struct's fields by name.
//
// Fails when the type does not resolve or has no fields, for the reason every walk
// here does: a renamed struct resolves to nothing, and a ceiling checked against
// nothing is a test that can only pass.
func modulesHandoffFields(t *testing.T, facade *packages.Package) map[string]*types.Var {
	t.Helper()

	obj := facade.Types.Scope().Lookup(modulesHandoffType)
	if obj == nil {
		t.Fatalf("kaiten.%s did not resolve -- the transitional handoff was renamed or removed. If it was "+
			"removed, that is the migration finishing: delete this test with it", modulesHandoffType)
	}
	structType, ok := obj.Type().Underlying().(*types.Struct)
	if !ok {
		t.Fatalf("kaiten.%s is not a struct, so its fields cannot be counted", modulesHandoffType)
	}

	fields := map[string]*types.Var{}
	for i := range structType.NumFields() {
		field := structType.Field(i)
		fields[field.Name()] = field
	}
	if len(fields) == 0 {
		t.Fatalf("kaiten.%s has no fields -- if the last driver moved onto the facade, delete the type, the "+
			"accessor and this test rather than leaving an empty handoff behind", modulesHandoffType)
	}
	return fields
}

// modulesAccessorObject resolves the (*Kaiten).Modules method, failing loudly when it
// does not: an accessor that resolved to nothing would leave the allowlist above
// watching for a call nobody can make.
func modulesAccessorObject(t *testing.T, facade *packages.Package) types.Object {
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
		if method := named.Method(i); method.Name() == modulesAccessor {
			return method
		}
	}
	t.Fatalf("kaiten.(*%s).%s did not resolve -- if the accessor is gone the migration is over, and this "+
		"test should go with it", facadeAppType, modulesAccessor)
	return nil
}
