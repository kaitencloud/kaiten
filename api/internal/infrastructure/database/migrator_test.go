package database

import (
	"io/fs"
	"path"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestMaxMigrationVersion(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name        string
		files       []string
		wantVersion int64
		wantErr     bool
	}{
		{
			name:        "picks the highest numeric prefix",
			files:       []string{"20250322124519_initial.sql", "20260705000000_add_entitlement_display_order.sql", "20260403130000_add_entitlement_groups.sql"},
			wantVersion: 20260705000000,
		},
		{
			name:        "single migration",
			files:       []string{"20250322124519_initial.sql"},
			wantVersion: 20250322124519,
		},
		{
			name:    "no migrations is an error",
			files:   nil,
			wantErr: true,
		},
		{
			name:    "files without a numeric prefix are ignored",
			files:   []string{"README.sql", "not_numeric_at_all.sql"},
			wantErr: true,
		},
		{
			name:        "mix of valid and unparsable filenames only counts the valid ones",
			files:       []string{"README.sql", "20260403130000_add_entitlement_groups.sql"},
			wantVersion: 20260403130000,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			fsys := fstest.MapFS{}
			for _, f := range tc.files {
				fsys["migrations/"+f] = &fstest.MapFile{Data: []byte("-- +goose Up\n")}
			}

			got, err := maxMigrationVersion(fsys, "migrations/*.sql")
			if tc.wantErr {
				if err == nil {
					t.Fatalf("maxMigrationVersion() error = nil, want error")
				}
				return
			}
			if err != nil {
				t.Fatalf("maxMigrationVersion() error = %v, want nil", err)
			}
			if got != tc.wantVersion {
				t.Fatalf("maxMigrationVersion() = %d, want %d", got, tc.wantVersion)
			}
		})
	}
}

func TestExpectedVersionMatchesRealEmbeddedMigrations(t *testing.T) {
	t.Parallel()

	got, err := ExpectedVersion()
	if err != nil {
		t.Fatalf("ExpectedVersion() error = %v", err)
	}

	want, err := maxMigrationVersion(embedMigrations, "migrations/*.sql")
	if err != nil {
		t.Fatalf("maxMigrationVersion() error = %v", err)
	}

	if got != want {
		t.Fatalf("ExpectedVersion() = %d, want %d", got, want)
	}
	if got <= 0 {
		t.Fatalf("ExpectedVersion() = %d, want a positive version from the real embedded migrations", got)
	}
}

// migrationTimestampLayout is the goose filename prefix: a UTC timestamp to
// the second, which is what makes the ordering total.
const migrationTimestampLayout = "20060102150405"

// TestMigrationPrefixesAreUniqueAndWellFormed is the collision gate.
//
// goose orders migrations on the numeric filename prefix alone, and git will
// merge two branches that each add a file with the SAME prefix without ever
// reporting a conflict: the two migrations then have no defined order, and
// nothing downstream notices. Several of the prefixes in this repository were
// hand-written to midnight (…000000) rather than generated, which is precisely
// how two same-day branches end up colliding.
//
// The name is also checked, because a prefix that is not a real timestamp
// still sorts — just not chronologically.
func TestMigrationPrefixesAreUniqueAndWellFormed(t *testing.T) {
	t.Parallel()

	entries, err := fs.Glob(embedMigrations, "migrations/*.sql")
	if err != nil {
		t.Fatalf("failed to glob migrations: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("no embedded migrations found")
	}

	seen := map[string]string{} // prefix -> the first file that claimed it
	for _, entry := range entries {
		name := path.Base(entry)

		prefix, rest, ok := strings.Cut(strings.TrimSuffix(name, ".sql"), "_")
		if !ok || rest == "" {
			t.Errorf("migration %q is not named <timestamp>_<description>.sql", name)
			continue
		}

		if _, err := time.Parse(migrationTimestampLayout, prefix); err != nil {
			t.Errorf(
				"migration %q has prefix %q, which is not a %s UTC timestamp: %v",
				name, prefix, migrationTimestampLayout, err,
			)
			continue
		}

		if first, duplicate := seen[prefix]; duplicate {
			t.Errorf(
				"migrations %q and %q share the prefix %s — goose cannot order them; regenerate one with `date -u +%%Y%%m%%d%%H%%M%%S`",
				first, name, prefix,
			)
			continue
		}
		seen[prefix] = name
	}
}
