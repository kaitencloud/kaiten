// This file guards the usage clock: every usage read and write reads the
// database clock through one expression, so the gauge a read shows and the
// window a report writes agree to the millisecond at a window boundary.
//
// The expression is date_trunc('milliseconds', clock_timestamp() AT TIME ZONE
// 'UTC')::timestamp(3). The one it replaced, (now() AT TIME ZONE
// 'UTC')::timestamp(3), was wrong twice: now() is frozen at the transaction's
// BEGIN, so a report that waited for its pair's lock across a boundary
// computed the window it began in; and the cast rounds, so 23:59:59.9996
// already read as the next window.
package architecture_test

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

const usageClockExpression = "date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)"

// legacyUsageClock matches the replaced expression, whatever its spacing or
// case.
var legacyUsageClock = regexp.MustCompile(`(?i)\(\s*now\(\)\s+AT\s+TIME\s+ZONE\s+'UTC'\s*\)\s*::\s*timestamp\(3\)`)

// usageClockQueries are the sqlc queries that read "now" for usage, by file
// relative to internal/modules. The GraphQL usage dataloader reads it only
// through GetEntitlementsUsageForInstanceWithFallback.
var usageClockQueries = map[string][]string{
	"instances/infrastructure/db/queries/entitlement_usage.sql": {
		"GetDatabaseNow",
		"GetEntitlementsUsageForInstanceWithFallback",
		"GetEntitlementUsageForInstanceOrDefault",
	},
	"entitlements/infrastructure/db/queries/entitlement_group.sql": {
		"GetEntitlementGroupUsage",
	},
}

func modulesDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate this test file")
	}
	return filepath.Join(filepath.Dir(file), "..", "..", "internal", "modules")
}

func TestNoQueryReadsTheLegacyUsageClock(t *testing.T) {
	queries, err := filepath.Glob(filepath.Join(modulesDir(t), "*", "infrastructure", "db", "queries", "*.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if len(queries) == 0 {
		t.Fatal("found no sqlc query files: the glob is stale")
	}

	for _, path := range queries {
		content, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		for i, line := range strings.Split(string(content), "\n") {
			if legacyUsageClock.MatchString(line) {
				t.Errorf("%s:%d reads (now() AT TIME ZONE 'UTC')::timestamp(3); use %s", path, i+1, usageClockExpression)
			}
		}
	}
}

func TestUsageQueriesReadTheUsageClock(t *testing.T) {
	for file, names := range usageClockQueries {
		content, err := os.ReadFile(filepath.Join(modulesDir(t), file))
		if err != nil {
			t.Fatal(err)
		}
		for _, name := range names {
			body, ok := sqlcQuery(string(content), name)
			if !ok {
				t.Errorf("%s: query %s not found; update usageClockQueries", file, name)
				continue
			}
			if !strings.Contains(body, usageClockExpression) {
				t.Errorf("%s: query %s does not read %s", file, name, usageClockExpression)
			}
		}
	}
}

// sqlcQuery returns the text of the named query, from its "-- name:" line to
// the next one.
func sqlcQuery(content, name string) (string, bool) {
	marker := "-- name: " + name + " "
	start := strings.Index(content, marker)
	if start < 0 {
		return "", false
	}
	rest := content[start+len(marker):]
	if end := strings.Index(rest, "-- name: "); end >= 0 {
		rest = rest[:end]
	}
	return rest, true
}
