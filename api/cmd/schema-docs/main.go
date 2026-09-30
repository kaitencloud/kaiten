package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"dagger.io/dagger"
	"github.com/joho/godotenv"
)

const (
	// partialIndexesMarker separates the DBML from the partial index list in
	// the generator container's output.
	partialIndexesMarker = "--- partial indexes ---"
	// partialIndexesQuery prints each partial index as a markdown list item.
	// It reaches psql through the environment, so the shell never parses it.
	partialIndexesQuery = "SELECT '- `' || indexname || '`: `' || indexdef || '`' " +
		"FROM pg_indexes WHERE schemaname = 'public' AND indexdef LIKE '% WHERE %' " +
		"ORDER BY indexname"
)

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
	connSecret := client.SetSecret(
		"kaiten_db_conn",
		fmt.Sprintf("postgres://%s:%s@db:5432/%s?sslmode=disable", dbUser, dbPassword, dbName),
	)

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
	output, err := client.Container().
		From("node:22-alpine").
		WithMountedCache("/root/.npm", client.CacheVolume("kaiten-npm")).
		WithExec([]string{"npm", "install", "-g", "@dbml/cli"}).
		WithExec([]string{"apk", "add", "--no-cache", "postgresql-client"}).
		WithFile("/bin/kaiten-admin-tools", adminToolsBin, dagger.ContainerWithFileOpts{Permissions: 0o755}).
		WithServiceBinding("db", postgres).
		WithSecretVariable("KAITEN_DATABASE_CONNECTION_STRING", connSecret).
		WithEnvVariable("PGHOST", "db").
		WithEnvVariable("PGUSER", dbUser).
		WithEnvVariable("PGDATABASE", dbName).
		WithSecretVariable("PGPASSWORD", dbPasswordSecret).
		WithEnvVariable("PARTIAL_INDEXES_MARKER", partialIndexesMarker).
		WithEnvVariable("PARTIAL_INDEXES_QUERY", partialIndexesQuery).
		WithExec([]string{
			"sh", "-c",
			`/bin/kaiten-admin-tools migrate up 1>&2 && ` +
				`db2dbml postgres "postgresql://$PGUSER:$PGPASSWORD@db:5432/$PGDATABASE?schemas=public" && ` +
				`echo "$PARTIAL_INDEXES_MARKER" && psql -At -c "$PARTIAL_INDEXES_QUERY"`,
		}).
		Stdout(ctx)
	if err != nil {
		return fmt.Errorf("generating DBML: %w", err)
	}
	dbml, partialIndexes, _ := strings.Cut(output, partialIndexesMarker+"\n")

	// ── 5. Write markdown output ───────────────────────────────────────────────
	content := "# Database Schema\n\n" +
		"> Auto-generated. Run `task schema-docs` to update.\n\n" +
		"```dbml\n" + strings.TrimRight(dbml, "\n") + "\n```\n"
	if partialIndexes = strings.TrimSpace(partialIndexes); partialIndexes != "" {
		content += "\n## Partial indexes\n\n" +
			"The DBML above renders these without their `WHERE` clause, as plain " +
			"indexes -- a partial unique index on one column even shows up as a " +
			"unique column. Each one only covers the rows its condition selects.\n\n" +
			partialIndexes + "\n"
	}

	//nolint:gosec // generated documentation checked into the repo; 0600 would
	// make the file unreadable to everything but the account that ran the tool
	return os.WriteFile(outputPath, []byte(content), 0o644)
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
