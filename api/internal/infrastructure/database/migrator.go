package database

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"path"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // Import pgx driver
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

//go:embed migrations/*.sql
var embedMigrations embed.FS

// pgUndefinedTable is the Postgres SQLSTATE for "relation does not exist" -
// returned when querying goose_db_version before any migration has ever run.
const pgUndefinedTable = "42P01"

// openDB opens a database/sql connection over the pgx stdlib driver and
// verifies connectivity with a ping. Callers are responsible for closing it.
func openDB(connString string) (*sql.DB, error) {
	db, err := sql.Open("pgx", connString)
	if err != nil {
		return nil, fmt.Errorf("failed to open database connection: %w", err)
	}

	if err := db.Ping(); err != nil {
		if closeErr := db.Close(); closeErr != nil {
			slog.Warn("failed to close database connection", "error", closeErr)
		}
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return db, nil
}

// newProvider builds a goose provider over the embedded migrations, guarded
// by a Postgres advisory-lock session locker so concurrent migrators (e.g.
// a Helm pre-upgrade hook overlapping an operator's manual `migrate up`, or
// multiple replicas racing on startup) serialize instead of corrupting
// goose_db_version.
func newProvider(db *sql.DB) (*goose.Provider, error) {
	fsys, err := fs.Sub(embedMigrations, "migrations")
	if err != nil {
		return nil, fmt.Errorf("failed to access embedded migrations: %w", err)
	}

	sessionLocker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return nil, fmt.Errorf("failed to create migration session locker: %w", err)
	}

	provider, err := goose.NewProvider(
		goose.DialectPostgres,
		db,
		fsys,
		goose.WithSessionLocker(sessionLocker),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create migration provider: %w", err)
	}

	return provider, nil
}

// RunMigrations applies all pending migrations to the database at connString.
func RunMigrations(connString string) error {
	slog.Info("Starting database migrations.")

	db, err := openDB(connString)
	if err != nil {
		return err
	}
	defer func(db *sql.DB) {
		if closeErr := db.Close(); closeErr != nil {
			slog.Warn("failed to close database connection", "error", closeErr)
		}
	}(db)

	provider, err := newProvider(db)
	if err != nil {
		return err
	}

	ctx := context.Background()

	// goose applies each migration in its own transaction, so a failure
	// leaves the database at the last successfully applied version - there
	// is no partially-applied migration to unwind. Recovery is fix-forward
	// (fix the migration, `migrate up` again) or an explicit, operator-
	// guarded `migrate down-to`; we deliberately don't auto-rollback here,
	// since silently reverting a failed migration would mask the failure
	// and could itself fail, leaving two errors to untangle instead of one.
	migrations, err := provider.Up(ctx)
	if err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}

	if len(migrations) == 0 {
		slog.Info("No pending migrations to apply. Database is up to date.")
	} else {
		slog.Info("Successfully applied migrations", "count", len(migrations))
		for _, migration := range migrations {
			slog.Info(
				"Migration applied",
				"version", migration.Source.Version,
				"type", migration.Source.Type,
				"path", migration.Source.Path,
				"duration", migration.Duration,
			)
		}
	}

	slog.Info("Database migrations applied successfully.")
	return nil
}

// ExpectedVersion returns the highest migration version embedded in this
// binary, derived from the numeric prefix of migrations/*.sql filenames
// (goose's own versioning scheme). This is what the binary expects the
// schema to be at once fully migrated.
func ExpectedVersion() (int64, error) {
	return maxMigrationVersion(embedMigrations, "migrations/*.sql")
}

// maxMigrationVersion is factored out of ExpectedVersion so the filename
// parsing can be unit-tested against a fake fs.FS without depending on the
// real embedded migrations directory.
func maxMigrationVersion(fsys fs.FS, pattern string) (int64, error) {
	entries, err := fs.Glob(fsys, pattern)
	if err != nil {
		return 0, fmt.Errorf("failed to glob migrations: %w", err)
	}

	var maxVersion int64
	for _, entry := range entries {
		name := path.Base(entry)
		prefix, _, ok := strings.Cut(name, "_")
		if !ok {
			continue
		}
		version, err := strconv.ParseInt(prefix, 10, 64)
		if err != nil {
			continue
		}
		if version > maxVersion {
			maxVersion = version
		}
	}

	if maxVersion == 0 {
		return 0, errors.New("no migrations found")
	}

	return maxVersion, nil
}

// DBVersion returns the current schema version recorded in goose_db_version,
// or 0 if that table doesn't exist yet (a database that has never been
// migrated).
func DBVersion(ctx context.Context, pool *pgxpool.Pool) (int64, error) {
	var version int64
	err := pool.QueryRow(ctx, "SELECT COALESCE(max(version_id), 0) FROM goose_db_version").Scan(&version)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == pgUndefinedTable {
			return 0, nil
		}
		return 0, fmt.Errorf("failed to query schema version: %w", err)
	}

	return version, nil
}

// IsSchemaCurrent reports whether the database schema is at least as new as
// what this binary expects. This intentionally checks >=, not ==: during a
// rolling upgrade the DB can be ahead of an older binary instance still
// finishing its rollout, and that instance must stay Ready rather than start
// failing readiness against a schema version it merely doesn't know about.
func IsSchemaCurrent(ctx context.Context, pool *pgxpool.Pool) (bool, error) {
	expected, err := ExpectedVersion()
	if err != nil {
		return false, err
	}

	current, err := DBVersion(ctx, pool)
	if err != nil {
		return false, err
	}

	return current >= expected, nil
}

// MigrationStatus returns the applied/pending state of every migration known
// to this binary.
func MigrationStatus(ctx context.Context, connString string) ([]*goose.MigrationStatus, error) {
	db, err := openDB(connString)
	if err != nil {
		return nil, err
	}
	defer func(db *sql.DB) {
		if closeErr := db.Close(); closeErr != nil {
			slog.Warn("failed to close database connection", "error", closeErr)
		}
	}(db)

	provider, err := newProvider(db)
	if err != nil {
		return nil, err
	}

	status, err := provider.Status(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get migration status: %w", err)
	}

	return status, nil
}

// DownTo migrates the database down to the given version, session-locked
// like RunMigrations. This is destructive (it runs migrations' Down scripts,
// which commonly drop data/columns/tables) - callers are expected to gate it
// behind an explicit operator opt-in (see cmd/admin-tools's `migrate
// down-to`), not call it unconditionally.
func DownTo(ctx context.Context, connString string, version int64) error {
	db, err := openDB(connString)
	if err != nil {
		return err
	}
	defer func(db *sql.DB) {
		if closeErr := db.Close(); closeErr != nil {
			slog.Warn("failed to close database connection", "error", closeErr)
		}
	}(db)

	provider, err := newProvider(db)
	if err != nil {
		return err
	}

	if _, err := provider.DownTo(ctx, version); err != nil {
		return fmt.Errorf("failed to migrate down to version %d: %w", version, err)
	}

	return nil
}
