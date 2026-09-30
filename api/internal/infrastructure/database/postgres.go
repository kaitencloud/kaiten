package database

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	typeLoaders   []func(context.Context, *pgx.Conn) error
	typeLoadersMu sync.RWMutex
)

// RegisterTypeLoader registers a function to load custom PostgreSQL types on each new connection.
// This function is safe to call from init() functions across different packages.
func RegisterTypeLoader(loader func(context.Context, *pgx.Conn) error) {
	typeLoadersMu.Lock()
	defer typeLoadersMu.Unlock()
	typeLoaders = append(typeLoaders, loader)
}

func buildPoolConfig(connString string) (*pgxpool.Config, error) {
	config, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	config.ConnConfig.Tracer = otelpgx.NewTracer()
	config.MinConns = 1
	config.HealthCheckPeriod = 30 * time.Second

	config.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		typeLoadersMu.RLock()
		loaders := typeLoaders
		typeLoadersMu.RUnlock()

		for _, loader := range loaders {
			if err := loader(ctx, conn); err != nil {
				return err
			}
		}
		return nil
	}

	return config, nil
}

func ConnectDB(connString string) (*pgxpool.Pool, error) {
	config, err := buildPoolConfig(connString)
	if err != nil {
		return nil, err
	}

	dbpool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	return dbpool, nil
}

// ConnectDBWithMaxConns creates a pool with a custom maximum connection count.
// Use when the caller needs higher concurrency than the default (e.g. the seeder).
func ConnectDBWithMaxConns(connString string, maxConns int32) (*pgxpool.Pool, error) {
	config, err := buildPoolConfig(connString)
	if err != nil {
		return nil, err
	}

	config.MaxConns = maxConns

	dbpool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	return dbpool, nil
}
