package main

import (
	"context"
	_ "embed"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"dagger.io/dagger"
	"github.com/joho/godotenv"
)

const (
	// dbmlCLI is the @dbml/cli release db2dbml comes from, pinned so the
	// document changes when the schema does, not when the tool does.
	dbmlCLI = "@dbml/cli@12.0.0"
	// partitionedTablesMarker separates the list of the tables
	// flatten_partitions.sql flattened, which it prints, from the DBML in the
	// container's output.
	partitionedTablesMarker = "--- partitioned tables ---"
	// partialIndexesMarker separates the DBML from the partial index list in
	// the generator container's output.
	partialIndexesMarker = "--- partial indexes ---"
	// partialIndexesQuery prints each partial index as a markdown list item.
	// It reaches psql through the environment, so the shell never parses it.
	partialIndexesQuery = "SELECT '- `' || indexname || '`: `' || indexdef || '`' " +
		"FROM pg_indexes WHERE schemaname = 'public' AND indexdef LIKE '% WHERE %' " +
		"ORDER BY indexname"
	// coveringIndexesMarker separates the partial index list from the covering
	// index list.
	coveringIndexesMarker = "--- covering indexes ---"
	// coveringIndexesQuery prints each index with an INCLUDE list as its name
	// and its definition, separated by a tab.
	coveringIndexesQuery = "SELECT indexname || E'\\t' || indexdef " +
		"FROM pg_indexes WHERE schemaname = 'public' AND indexdef LIKE '% INCLUDE (%' " +
		"ORDER BY indexname"
)

// flattenPartitionsSQL turns each partitioned table into an ordinary one before
// db2dbml reads the schema; flatten_partitions.sql says why.
//
//go:embed flatten_partitions.sql
var flattenPartitionsSQL string

func main() {
	ctx := context.Background()

	root := projectRoot()
	_ = godotenv.Load(filepath.Join(root, ".env"))

	dbUser := mustEnv("KAITEN_DATABASE_USER")
	dbPassword := mustEnv("KAITEN_DATABASE_PASSWORD")
	dbName := envOrDefault("KAITEN_DATABASE", "kaiten")
	outputPath := filepath.Join(root, "api", "docs", "database_schema.md")

	if err := generate(ctx, root, dbUser, dbPassword, dbName, outputPath); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Generated: %s\n", outputPath)
}

func generate(ctx context.Context, root, dbUser, dbPassword, dbName, outputPath string) error {
	client, err := dagger.Connect(ctx, dagger.WithLogOutput(os.Stderr))
	if err != nil {
		return fmt.Errorf("connecting to dagger: %w", err)
	}
	defer func() {
		client.Close()
		cleanupDaggerEngine()
	}()

	dbPasswordSecret := client.SetSecret("kaiten_db_password", dbPassword)
	// Built as URLs, so that a user or a password holding @ : / # % still
	// parses: pasted in, it broke the URI, and db2dbml prints such an error on
	// its standard output, connection string included, then exits 0.
	connSecret := client.SetSecret("kaiten_db_conn", databaseURL("postgres", dbUser, dbPassword, dbName, "sslmode=disable"))
	db2dbmlSecret := client.SetSecret("kaiten_db2dbml_conn", databaseURL("postgresql", dbUser, dbPassword, dbName, "schemas=public"))

	// ── 1. PostgreSQL 17.4 service ─────────────────────────────────────────────
	postgres := client.Container().
		From("postgres:17.4").
		WithEnvVariable("POSTGRES_USER", dbUser).
		WithSecretVariable("POSTGRES_PASSWORD", dbPasswordSecret).
		WithEnvVariable("POSTGRES_DB", dbName).
		WithExposedPort(5432).
		AsService()

	// ── 2. Build kaiten-admin-tools binary ────────────────────────────────────
	// Migrations moved out of the seeder into a standalone CLI (see
	// api/cmd/admin-tools) - it's what actually owns `migrate up` now.
	//
	// Built on the host and handed to the container as a file, rather than
	// inside a golang container: the host toolchain already has the module
	// cache warm, so it cross-compiles for the container's platform in a few
	// seconds instead of downloading the whole module graph into a fresh image.
	adminToolsPath, err := buildAdminTools(ctx, root)
	if err != nil {
		return err
	}
	adminToolsBin := client.Host().File(adminToolsPath)

	// ── 3+4. Migrate then generate DBML in one container ─────────────────────
	// Both steps share the same service binding so postgres stays alive between
	// the migration and the schema introspection. admin-tools logs go to
	// stderr so only the DBML text reaches stdout.
	//
	// db2dbml drops an index's WHERE clause: a partial unique index comes out
	// as a plain unique column or index, which states a rule the schema does
	// not have (license.family_id is not unique; one default per family is).
	// The partial indexes are therefore listed after the DBML, from the same
	// database, so the document says what they really are.
	//
	// db2dbml cannot read a partitioned table either: flatten_partitions.sql
	// turns each one into an ordinary table of the same definition, and prints
	// what it flattened, which the document lists.
	//
	// db2dbml also prints an index's INCLUDE columns as key columns, which
	// claims keys the schema does not have: a unique index on lookup_hash that
	// includes organization_id reads as unique on the pair. The covering indexes
	// are listed after the partial ones, and their DBML lines are corrected to
	// their key columns below.
	output, err := client.Container().
		From("node:22-alpine").
		WithMountedCache("/root/.npm", client.CacheVolume("kaiten-npm")).
		WithExec([]string{"npm", "install", "-g", dbmlCLI}).
		WithExec([]string{"apk", "add", "--no-cache", "postgresql-client"}).
		WithFile("/bin/kaiten-admin-tools", adminToolsBin, dagger.ContainerWithFileOpts{Permissions: 0o755}).
		WithServiceBinding("db", postgres).
		WithSecretVariable("KAITEN_DATABASE_CONNECTION_STRING", connSecret).
		WithEnvVariable("PGHOST", "db").
		WithEnvVariable("PGUSER", dbUser).
		WithEnvVariable("PGDATABASE", dbName).
		WithSecretVariable("PGPASSWORD", dbPasswordSecret).
		WithSecretVariable("DB2DBML_CONNECTION", db2dbmlSecret).
		WithEnvVariable("PARTITIONED_TABLES_MARKER", partitionedTablesMarker).
		WithEnvVariable("FLATTEN_PARTITIONS_SQL", flattenPartitionsSQL).
		WithEnvVariable("PARTIAL_INDEXES_MARKER", partialIndexesMarker).
		WithEnvVariable("PARTIAL_INDEXES_QUERY", partialIndexesQuery).
		WithEnvVariable("COVERING_INDEXES_MARKER", coveringIndexesMarker).
		WithEnvVariable("COVERING_INDEXES_QUERY", coveringIndexesQuery).
		WithExec([]string{
			"sh", "-c",
			`/bin/kaiten-admin-tools migrate up 1>&2 && ` +
				`psql -q -At -v ON_ERROR_STOP=1 -c "$FLATTEN_PARTITIONS_SQL" && echo "$PARTITIONED_TABLES_MARKER" && ` +
				`db2dbml postgres "$DB2DBML_CONNECTION" && ` +
				`echo "$PARTIAL_INDEXES_MARKER" && psql -At -c "$PARTIAL_INDEXES_QUERY" && ` +
				`echo "$COVERING_INDEXES_MARKER" && psql -At -c "$COVERING_INDEXES_QUERY"`,
		}).
		Stdout(ctx)
	if err != nil {
		return fmt.Errorf("generating DBML: %w", err)
	}
	partitionedTables, rest, _ := strings.Cut(output, partitionedTablesMarker+"\n")
	dbml, rest, _ := strings.Cut(rest, partialIndexesMarker+"\n")
	partialIndexes, coveringIndexes, _ := strings.Cut(rest, coveringIndexesMarker+"\n")
	// db2dbml reports a failure on its standard output and exits 0, so its
	// output is checked before it becomes the document: an output without a
	// table is that report, and so is an ERROR line printed after some tables.
	if err := checkDBML(dbml); err != nil {
		return err
	}
	dbml, coveringList, err := correctCoveringIndexes(dbml, coveringIndexes)
	if err != nil {
		return err
	}

	// ── 5. Write markdown output ───────────────────────────────────────────────
	content := "# Database Schema\n\n" +
		"> Auto-generated. Run `task schema-docs` to update.\n\n" +
		"```dbml\n" + strings.TrimRight(dbml, "\n") + "\n```\n"
	if partitionedTables = strings.TrimSpace(partitionedTables); partitionedTables != "" {
		content += "\n## Partitioned tables\n\n" +
			"The DBML above shows each of these once, as the table its partitions " +
			"share: the same columns, constraints and indexes, under the same " +
			"names. The partitions themselves are left out.\n\n" +
			partitionedTables + "\n"
	}
	if partialIndexes = strings.TrimSpace(partialIndexes); partialIndexes != "" {
		content += "\n## Partial indexes\n\n" +
			"The DBML above renders these without their `WHERE` clause, as plain " +
			"indexes -- a partial unique index on one column even shows up as a " +
			"unique column. Each one only covers the rows its condition selects.\n\n" +
			partialIndexes + "\n"
	}
	if coveringList != "" {
		content += "\n## Covering indexes\n\n" +
			"The DBML above lists each of these with its key columns only. The " +
			"`INCLUDE` columns are stored in the index, to answer a query without " +
			"reading the table; they are not part of its key, and take no part in " +
			"its uniqueness.\n\n" +
			coveringList + "\n"
	}

	//nolint:gosec // generated documentation checked into the repo; 0600 would
	// make the file unreadable to everything but the account that ran the tool
	return os.WriteFile(outputPath, []byte(content), 0o644)
}

// databaseURL is the connection string of the throwaway database, with the
// user and the password escaped.
func databaseURL(scheme, user, password, database, query string) string {
	return (&url.URL{
		Scheme:   scheme,
		User:     url.UserPassword(user, password),
		Host:     "db:5432",
		Path:     "/" + database,
		RawQuery: query,
	}).String()
}

// checkDBML refuses db2dbml's output when it is an error report rather than a
// schema: db2dbml prints its failures on its standard output and exits 0.
func checkDBML(dbml string) error {
	if !strings.Contains("\n"+dbml, "\nTable ") {
		return fmt.Errorf("db2dbml returned no table:\n%s", strings.TrimSpace(dbml))
	}
	for line := range strings.SplitSeq(dbml, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "ERROR:") {
			return fmt.Errorf("db2dbml reported an error:\n%s", strings.TrimSpace(line))
		}
	}
	return nil
}

// coveringIndexDef splits an index definition with an INCLUDE list into its
// key columns and its included ones.
var coveringIndexDef = regexp.MustCompile(` USING \w+ \((.+?)\) INCLUDE \((.+?)\)`)

// correctCoveringIndexes rewrites, in the DBML, the column list of every index
// listed (one "name<TAB>definition" line each) to its key columns, and returns
// the corrected DBML with the markdown list of those indexes. An index it
// cannot find in the DBML stops the run: the document would keep its wrong key.
func correctCoveringIndexes(dbml, listed string) (string, string, error) {
	var items []string
	for line := range strings.SplitSeq(strings.TrimSpace(listed), "\n") {
		if line == "" {
			continue
		}
		name, def, ok := strings.Cut(line, "\t")
		m := coveringIndexDef.FindStringSubmatch(def)
		if !ok || m == nil {
			return "", "", fmt.Errorf("covering index not understood: %q", line)
		}
		key := m[1]
		if strings.Contains(key, ",") {
			key = "(" + key + ")"
		}
		indexLine := regexp.MustCompile(`(?m)^(\s+)\S.*?( \[[^\]]*name: "` + regexp.QuoteMeta(name) + `"[^\]]*\])$`)
		if !indexLine.MatchString(dbml) {
			return "", "", fmt.Errorf("covering index %s not found in the DBML", name)
		}
		dbml = indexLine.ReplaceAllString(dbml, "${1}"+strings.ReplaceAll(key, "$", "$$")+"${2}")
		items = append(items, "- `"+name+"`: `"+def+"`")
	}
	return dbml, strings.Join(items, "\n"), nil
}

// buildAdminTools cross-compiles cmd/admin-tools for the Linux container that
// runs the migrations, on the host's own toolchain, and returns the binary's
// path. The container's architecture is the host's: Docker Desktop runs
// arm64 containers on Apple silicon and amd64 ones on Intel, and CI runs on
// Linux natively.
func buildAdminTools(ctx context.Context, root string) (string, error) {
	out := filepath.Join(os.TempDir(), "kaiten-admin-tools-linux-"+runtime.GOARCH)

	cmd := exec.CommandContext(ctx, "go", "build", "-ldflags=-s -w", "-o", out, "./cmd/admin-tools")
	cmd.Dir = filepath.Join(root, "api")
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS=linux", "GOARCH="+runtime.GOARCH)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("building kaiten-admin-tools for linux/%s: %w", runtime.GOARCH, err)
	}

	return out, nil
}

// cleanupDaggerEngine stops and removes the Dagger engine container so nothing
// lingers after the program exits.
func cleanupDaggerEngine() {
	out, err := exec.Command("docker", "ps", "-q", "--filter", "name=dagger-engine").Output()
	if err != nil || len(strings.TrimSpace(string(out))) == 0 {
		return
	}
	ids := strings.Fields(strings.TrimSpace(string(out)))
	args := append([]string{"rm", "-f"}, ids...)
	if err := exec.Command("docker", args...).Run(); err != nil {
		fmt.Fprintf(os.Stderr, "warning: Dagger engine cleanup failed: %v\n", err)
	}
}

// projectRoot returns the project root directory. Reads PROJECT_ROOT env var
// (set by the Taskfile), falling back to one level above the working directory
// (the conventional layout when run via `go run ./cmd/schema-docs` from api/).
func projectRoot() string {
	if root := os.Getenv("PROJECT_ROOT"); root != "" {
		abs, err := filepath.Abs(root)
		if err == nil {
			return abs
		}
		return root
	}
	wd, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: getting working directory: %v\n", err)
		os.Exit(1)
	}
	return filepath.Dir(wd)
}

func mustEnv(key string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	fmt.Fprintf(os.Stderr, "error: %s is required (set in .env or environment)\n", key)
	os.Exit(1)
	return ""
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
