package dogfooding_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

// EntitlementSlugs is hand-maintained next to the constants it lists, and the
// cost of forgetting an entry is not a compile error: kaiten would keep
// reporting against a slug nothing ever created, so the first create on that
// path fails its check in production.
func TestEntitlementSlugsListsEveryDeclaredSlug(t *testing.T) {
	declared := declaredSlugConstants(t)
	if len(declared) == 0 {
		t.Fatal("found no *EntitlementSlug constants; the parser is looking in the wrong place")
	}

	values := make(map[string]bool, len(dogfooding.EntitlementSlugs))
	for _, slug := range dogfooding.EntitlementSlugs {
		values[slug] = true
	}

	for name, value := range declared {
		if !values[value] {
			t.Errorf("%s (%q) is declared but missing from EntitlementSlugs", name, value)
		}
	}

	if len(declared) != len(dogfooding.EntitlementSlugs) {
		t.Errorf("EntitlementSlugs has %d entries, %d constants are declared",
			len(dogfooding.EntitlementSlugs), len(declared))
	}
}

func TestEntitlementSlugsHasNoDuplicates(t *testing.T) {
	seen := make(map[string]bool, len(dogfooding.EntitlementSlugs))
	for _, slug := range dogfooding.EntitlementSlugs {
		if slug == "" {
			t.Error("EntitlementSlugs contains an empty slug")
		}
		if seen[slug] {
			t.Errorf("%q appears more than once in EntitlementSlugs", slug)
		}
		seen[slug] = true
	}
}

// Metered slugs are the ones a finite threshold is set on, so one that is not
// in the catalogue at all would gate a create path against an entitlement
// nobody created.
func TestMeteredSlugsAreCatalogueSlugs(t *testing.T) {
	for _, slug := range dogfooding.MeteredEntitlementSlugs {
		if !slices.Contains(dogfooding.EntitlementSlugs, slug) {
			t.Errorf("metered slug %q is not in EntitlementSlugs", slug)
		}
	}
}

// A boolean slug the catalogue never creates is a connector that reads as unlicensed
// for everybody; one created as a NUMBER instead is a connector that reads as
// unlicensed because the value has the wrong shape. Both are silent, so both are
// pinned here.
func TestBooleanSlugsAreCatalogueSlugs(t *testing.T) {
	for _, slug := range dogfooding.BooleanEntitlementSlugs {
		if !slices.Contains(dogfooding.EntitlementSlugs, slug) {
			t.Errorf("boolean slug %q is not in EntitlementSlugs", slug)
		}
	}
}

// The two lists say what TYPE an entitlement is created as, so a slug in both would
// be a contradiction the catalogue could only resolve by picking one.
func TestBooleanAndMeteredSlugsAreDisjoint(t *testing.T) {
	for _, slug := range dogfooding.BooleanEntitlementSlugs {
		if slices.Contains(dogfooding.MeteredEntitlementSlugs, slug) {
			t.Errorf("%q is listed as both a boolean and a metered slug", slug)
		}
	}
}

// A config slug the catalogue never creates, or creates with another type, is a
// setting every organization reads as unknown.
func TestConfigSlugsAreCatalogueSlugsOfTheirOwnType(t *testing.T) {
	for _, slug := range dogfooding.ConfigEntitlementSlugs {
		if !slices.Contains(dogfooding.EntitlementSlugs, slug) {
			t.Errorf("config slug %q is not in EntitlementSlugs", slug)
		}
		if slices.Contains(dogfooding.BooleanEntitlementSlugs, slug) || slices.Contains(dogfooding.MeteredEntitlementSlugs, slug) {
			t.Errorf("config slug %q is also listed as a boolean or metered slug", slug)
		}
	}
}

// declaredSlugConstants returns name -> value for every *EntitlementSlug
// constant in this package, read out of the source rather than the binary.
func declaredSlugConstants(t *testing.T) map[string]string {
	t.Helper()

	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read package directory: %v", err)
	}

	fset := token.NewFileSet()
	found := map[string]string{}
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}

		file, err := parser.ParseFile(fset, name, nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", name, err)
		}

		collectSlugConstants(t, file, found)
	}

	return found
}

// collectSlugConstants adds every `X EntitlementSlug = "literal"` in one file
// to found. Only string literals: a slug computed from something else would be
// a value this test cannot read out of the source, and silently skipping it
// would be worse than the drift the test exists to catch -- so the count
// assertion in the caller fails instead.
func collectSlugConstants(t *testing.T, file *ast.File, found map[string]string) {
	t.Helper()

	for _, decl := range file.Decls {
		genDecl, ok := decl.(*ast.GenDecl)
		if !ok || genDecl.Tok != token.CONST {
			continue
		}
		for _, spec := range genDecl.Specs {
			valueSpec, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			for i, name := range valueSpec.Names {
				if !strings.HasSuffix(name.Name, "EntitlementSlug") || i >= len(valueSpec.Values) {
					continue
				}
				literal, ok := valueSpec.Values[i].(*ast.BasicLit)
				if !ok || literal.Kind != token.STRING {
					continue
				}
				unquoted, err := strconv.Unquote(literal.Value)
				if err != nil {
					t.Fatalf("unquote %s: %v", name.Name, err)
				}
				found[name.Name] = unquoted
			}
		}
	}
}
