package seeder

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
)

const dbName = "kaiten"

// ResetDatabase drops and recreates the kaiten database, then runs migrations.
// This is a destructive operation that will delete all data.
func ResetDatabase(connString string) error {
	slog.Info("🗑️  Resetting database...", "database", dbName)

	ctx := context.Background()

	// Build admin connection string by replacing the database name with 'postgres'
	adminConnString := replaceDBName(connString, "postgres")

	// Connect to postgres database (admin connection) to drop/create the target database
	conn, err := pgx.Connect(ctx, adminConnString)
	if err != nil {
		return fmt.Errorf("failed to connect to admin database: %w", err)
	}
	defer conn.Close(ctx)

	slog.Info("   Terminating existing connections...", "database", dbName)
	_, _ = conn.Exec(ctx, `
		SELECT pg_terminate_backend(pg_stat_activity.pid)
		FROM pg_stat_activity
		WHERE pg_stat_activity.datname = $1
		AND pid <> pg_backend_pid()
	`, dbName)

	slog.Info("   Dropping database...", "database", dbName)
	_, err = conn.Exec(ctx, fmt.Sprintf(`DROP DATABASE "%s"`, dbName))
	if err != nil {
		return fmt.Errorf("failed to drop database %s: %w", dbName, err)
	}

	// Create database
	slog.Info("   Creating database...", "database", dbName)
	_, err = conn.Exec(ctx, fmt.Sprintf(`CREATE DATABASE "%s"`, dbName))
	if err != nil {
		return fmt.Errorf("failed to create database %s: %w", dbName, err)
	}

	conn.Close(ctx)

	// Run migrations on the newly created database
	slog.Info("   Running migrations...")
	if err := database.RunMigrations(connString); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	slog.Info("✅ Database reset complete", "database", dbName)
	return nil
}

// replaceDBName replaces the database name in a connection string.
// Input format: postgres://user:password@host:port/dbname?sslmode=disable
func replaceDBName(connString, newDBName string) string {
	// Find the last / before ? (or end of string)
	lastSlash := strings.LastIndex(connString, "/")
	if lastSlash == -1 {
		return connString
	}

	// Find ? after the last /
	queryStart := strings.Index(connString[lastSlash:], "?")
	if queryStart == -1 {
		// No query params, just replace everything after last /
		return connString[:lastSlash+1] + newDBName
	}

	// Replace database name, keep query params
	return connString[:lastSlash+1] + newDBName + connString[lastSlash+queryStart:]
}
