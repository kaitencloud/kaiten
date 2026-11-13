package listfororganization

import (
	"os"
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// eventList captures the literal of a `<> ALL('{...}'::text[])` filter.
var eventList = regexp.MustCompile(`<> ALL\('(\{[^']+\})'::text\[\]\)`)

// The planner uses a partial index only when it can prove the query's filter
// implies the index's. If the two lists drift apart the query still answers
// correctly, just in seconds instead of milliseconds, which no other test sees.
func TestChangesQueryAndItsIndexNameTheSameEvents(t *testing.T) {
	read := func(path string) string {
		content, err := os.ReadFile(path)
		require.NoError(t, err)
		return string(content)
	}
	migration := eventList.FindStringSubmatch(read(
		"../../../infrastructure/database/migrations/20261109120000_audit_trail_changes_index.sql"))
	query := eventList.FindStringSubmatch(read("../infrastructure/db/queries/audit_trail.sql"))

	require.Len(t, migration, 2, "the index no longer filters on a literal event list")
	require.Len(t, query, 2, "ListOrganizationChanges no longer filters on a literal event list")
	assert.Equal(t, migration[1], query[1])
}
