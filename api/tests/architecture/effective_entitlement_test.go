// This file guards the effective entitlement: what an instance is entitled to
// is read from the instance_effective_entitlement view, never by joining
// license_entitlement, so that a layer added to the view -- an add-on, a
// temporary boost -- reaches the usage gate, every usage read, group usage and
// the targeting facts at once, and no reader is left showing the bare licence
// grant.
package architecture_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// effectiveEntitlementModules are the modules that read an instance's
// entitlements. The licenses module owns license_entitlement and reads it as
// what it is: a licence's grants.
var effectiveEntitlementModules = []string{"instances", "entitlements", "customers"}

// licenceCatalogueQueries read what a licence grants rather than what an
// instance is entitled to, so they keep joining license_entitlement. An entry
// here is a claim that the query is not about an instance.
var licenceCatalogueQueries = map[string]string{
	"GetEntitlementGroupsForLicense": "the groups of a licence's grants, for the licence catalogue",
}

// licenseEntitlementTable matches the table name alone: not
// license_entitlement_id, not instance_effective_entitlement.
var licenseEntitlementTable = regexp.MustCompile(`\blicense_entitlement\b`)

func TestInstanceEntitlementReadersUseTheEffectiveView(t *testing.T) {
	seen := map[string]bool{}
	for _, module := range effectiveEntitlementModules {
		files, err := filepath.Glob(filepath.Join(modulesDir(t), module, "infrastructure", "db", "queries", "*.sql"))
		if err != nil {
			t.Fatal(err)
		}
		if len(files) == 0 {
			t.Fatalf("found no sqlc query files for module %s: the glob is stale", module)
		}
		for _, path := range files {
			content, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			for name, body := range sqlcQueries(string(content)) {
				if !licenseEntitlementTable.MatchString(withoutComments(body)) {
					continue
				}
				if _, ok := licenceCatalogueQueries[name]; ok {
					seen[name] = true
					continue
				}
				t.Errorf("%s: query %s joins license_entitlement; read instance_effective_entitlement instead "+
					"(or, for a licence's grants rather than an instance's, list it in licenceCatalogueQueries)", path, name)
			}
		}
	}
	for name := range licenceCatalogueQueries {
		if !seen[name] {
			t.Errorf("licenceCatalogueQueries lists %s, which no longer joins license_entitlement: delete the entry", name)
		}
	}
}

// sqlcQueries splits a query file into its named queries.
func sqlcQueries(content string) map[string]string {
	queries := map[string]string{}
	parts := strings.Split(content, "-- name: ")
	for _, part := range parts[1:] {
		name, body, _ := strings.Cut(part, " ")
		queries[name] = body
	}
	return queries
}

// withoutComments drops SQL line comments, so a query that only mentions the
// table in its documentation is not mistaken for one that joins it.
func withoutComments(sql string) string {
	lines := strings.Split(sql, "\n")
	for i, line := range lines {
		if before, _, found := strings.Cut(line, "--"); found {
			lines[i] = before
		}
	}
	return strings.Join(lines, "\n")
}
