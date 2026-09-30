package seeder

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

const createTrackerTableSQL = `
CREATE TABLE IF NOT EXISTS seeder_runs (
	id         SERIAL PRIMARY KEY,
	profile    TEXT NOT NULL UNIQUE,
	seeded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`

// EnsureTrackerTable creates the seeder_runs tracking table if it does not exist.
// This table is managed by the seeder itself and is not part of the application schema.
// It is naturally cleared when --clean is used, as that drops and recreates the entire database.
func EnsureTrackerTable(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, createTrackerTableSQL)
	if err != nil {
		return fmt.Errorf("failed to create seeder_runs table: %w", err)
	}
	return nil
}

// HasRun returns true if the given profile has already been seeded.
func HasRun(ctx context.Context, pool *pgxpool.Pool, profile string) (bool, error) {
	var exists bool
	err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM seeder_runs WHERE profile = $1)`, profile).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check seeder_runs: %w", err)
	}
	return exists, nil
}

// MarkAsRun records that the given profile has been seeded.
func MarkAsRun(ctx context.Context, pool *pgxpool.Pool, profile string) error {
	_, err := pool.Exec(
		ctx,
		`INSERT INTO seeder_runs (profile) VALUES ($1) ON CONFLICT (profile) DO UPDATE SET seeded_at = NOW()`,
		profile,
	)
	if err != nil {
		return fmt.Errorf("failed to record seeder run: %w", err)
	}
	return nil
}
