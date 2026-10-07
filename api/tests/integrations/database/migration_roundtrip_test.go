// Package database_test runs the migrations both ways against a real
// Postgres.
//
// Every migration in this repository ships a Down block, none of them had ever
// been executed: the shared tests.TestDatabase helper migrates up once and
// snapshots the container, and kaiten-admin-tools' `migrate down-to` is gated
// behind --yes plus KAITEN_ALLOW_DOWN_MIGRATIONS=true. That made the Down
// blocks code whose first execution would be at 3am under stress. This test
// executes them on a throwaway container instead.
package database_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/lib/pq" // used by testcontainers for snapshots
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
)

// TestMigrationsRoundTrip asserts up -> down-to-0 -> up.
//
// Two distinct failures are caught. Down leaving something behind: after
// down-to-0 the public schema must hold nothing but goose's own bookkeeping.
// And Down reverting to a *different* shape than it started from: the schema
// fingerprint after the second up must equal the one after the first, or the
// Down blocks quietly rewrite the database they claim to restore.
func TestMigrationsRoundTrip(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()

	connString := startPostgres(ctx, t)

	if err := database.RunMigrations(connString); err != nil {
		t.Fatalf("first RunMigrations() error = %v", err)
	}

	pool, err := database.ConnectDB(connString)
	if err != nil {
		t.Fatalf("failed to connect to database: %v", err)
	}
	t.Cleanup(pool.Close)

	before := schemaFingerprint(ctx, t, pool)

	if err := database.DownTo(ctx, connString, 0); err != nil {
		t.Fatalf("DownTo(0) error = %v", err)
	}

	version, err := database.DBVersion(ctx, pool)
	if err != nil {
		t.Fatalf("DBVersion() after down error = %v", err)
	}
	if version != 0 {
		t.Fatalf("schema version after DownTo(0) = %d, want 0", version)
	}

	if leftovers := publicSchemaObjects(ctx, t, pool); len(leftovers) > 0 {
		t.Errorf(
			"DownTo(0) left %d object(s) behind in the public schema:\n  %s",
			len(leftovers), strings.Join(leftovers, "\n  "),
		)
	}

	if err := database.RunMigrations(connString); err != nil {
		t.Fatalf("second RunMigrations() error = %v", err)
	}

	after := schemaFingerprint(ctx, t, pool)
	if before != after {
		t.Errorf(
			"schema differs after a down/up round trip:\n--- after first up\n%s\n--- after second up\n%s",
			before, after,
		)
	}
}

func startPostgres(ctx context.Context, t *testing.T) string {
	t.Helper()

	connString, terminate, err := startPostgresContainer(ctx)
	if err != nil {
		t.Fatalf("%v", err)
	}
	t.Cleanup(terminate)

	return connString
}

// startPostgresContainer starts a throwaway Postgres and hands back its
// connection string plus a terminate func, leaving the lifetime to the caller:
// this test wants a container it can migrate down to nothing, while the
// constraint tests in platform_identity_test.go share one for the whole package.
func startPostgresContainer(ctx context.Context) (string, func(), error) {
	container, err := postgres.Run(
		ctx,
		"postgres:17-alpine",
		postgres.WithDatabase("kaiten"),
		postgres.WithUsername("kaiten"),
		postgres.WithPassword("kaiten"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		return "", nil, fmt.Errorf("failed to start postgres container: %w", err)
	}
	terminate := func() { _ = container.Terminate(context.Background()) }

	connString, err := container.ConnectionString(ctx)
	if err != nil {
		terminate()
		return "", nil, fmt.Errorf("failed to get connection string: %w", err)
	}
	host, err := container.Host(ctx)
	if err != nil {
		terminate()
		return "", nil, fmt.Errorf("failed to get container host: %w", err)
	}
	if strings.Contains(strings.ToLower(connString), "localhost") {
		connString = strings.Replace(connString, "localhost", host, 1)
	}

	return connString, terminate, nil
}

// gooseBookkeeping matches goose_db_version and its identity sequence, the
// only things down-to-0 is expected to leave in place.
const gooseBookkeeping = "goose_db_version%"

// schemaFingerprint renders every part of the public schema a migration can
// create, as one comparable string. Anything a Down block forgets to restore -
// a column type, a check clause, an enum label, a trigger - shows up as a diff.
func schemaFingerprint(ctx context.Context, t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()

	sections := []struct {
		name  string
		query string
	}{
		{"columns", `
			SELECT format('%s.%s %s%s nullable=%s default=%s',
			              table_name, column_name, udt_name,
			              coalesce('(' || datetime_precision || ')', ''),
			              is_nullable, coalesce(column_default, '-'))
			FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name NOT LIKE $1
			ORDER BY table_name, column_name`},
		{"constraints", `
			SELECT format('%s %s %s', conrelid::regclass, conname, pg_get_constraintdef(oid))
			FROM pg_constraint
			WHERE connamespace = 'public'::regnamespace
			  AND conrelid::regclass::text NOT LIKE $1
			ORDER BY 1`},
		{"indexes", `
			SELECT indexdef
			FROM pg_indexes
			WHERE schemaname = 'public' AND tablename NOT LIKE $1
			ORDER BY 1`},
		{"enums", `
			SELECT format('%s = %s', t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder))
			FROM pg_type t
			JOIN pg_enum e ON e.enumtypid = t.oid
			JOIN pg_namespace n ON n.oid = t.typnamespace
			WHERE n.nspname = 'public' AND t.typname NOT LIKE $1
			GROUP BY t.typname
			ORDER BY 1`},
		// pg_get_functiondef refuses an aggregate, which is described by its
		// definition instead.
		{"functions", `
			SELECT CASE
			         WHEN p.prokind = 'a' THEN format('aggregate %s(%s) sfunc=%s stype=%s initcond=%s',
			           p.proname, pg_get_function_arguments(p.oid), a.aggtransfn::regproc,
			           format_type(a.aggtranstype, NULL), a.agginitval)
			         ELSE pg_get_functiondef(p.oid)
			       END
			FROM pg_proc p
			JOIN pg_namespace n ON n.oid = p.pronamespace
			LEFT JOIN pg_aggregate a ON a.aggfnoid = p.oid
			WHERE n.nspname = 'public' AND p.proname NOT LIKE $1
			ORDER BY 1`},
		{"triggers", `
			SELECT pg_get_triggerdef(tg.oid)
			FROM pg_trigger tg
			JOIN pg_class c ON c.oid = tg.tgrelid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'public' AND NOT tg.tgisinternal AND c.relname NOT LIKE $1
			ORDER BY 1`},
	}

	var out strings.Builder
	for _, section := range sections {
		out.WriteString("[" + section.name + "]\n")
		for _, line := range queryStrings(ctx, t, pool, section.query) {
			out.WriteString(line + "\n")
		}
	}

	return out.String()
}

// publicSchemaObjects lists everything left in the public schema apart from
// goose's own bookkeeping - what down-to-0 should have removed.
func publicSchemaObjects(ctx context.Context, t *testing.T, pool *pgxpool.Pool) []string {
	t.Helper()

	const query = `
		SELECT format('%s %s', c.relkind, c.relname)
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public'
		  AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
		  AND c.relname NOT LIKE $1
		UNION ALL
		SELECT format('type %s', t.typname)
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'public'
		  AND t.typtype IN ('e', 'd')
		  AND t.typname NOT LIKE $1
		UNION ALL
		SELECT format('function %s', p.proname)
		FROM pg_proc p
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'public'
		  AND p.proname NOT LIKE $1
		ORDER BY 1`

	return queryStrings(ctx, t, pool, query)
}

func queryStrings(ctx context.Context, t *testing.T, pool *pgxpool.Pool, query string) []string {
	t.Helper()

	rows, err := pool.Query(ctx, query, gooseBookkeeping)
	if err != nil {
		t.Fatalf("schema introspection failed: %v\nquery: %s", err, query)
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			t.Fatalf("schema introspection scan failed: %v", err)
		}
		out = append(out, strings.Join(strings.Fields(value), " "))
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("schema introspection failed: %v", err)
	}

	return out
}
