package tests

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/lib/pq" // Used by testcontainers for snapshots
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
)

type TestData struct {
	UserID         uuid.UUID
	OrganizationID uuid.UUID
	Name           string
}

type TestDatabase struct {
	DefaultData *TestData
	DbPool      *pgxpool.Pool
	// ConnectionString is the container's DSN, exposed for tests that exercise a
	// binary rather than a package: cmd/admin-tools reads
	// KAITEN_DATABASE_CONNECTION_STRING from the environment and opens its own
	// pool, so its tests need the string, not the pool.
	ConnectionString string
	container        *postgres.PostgresContainer
}

func NewTestDatabase() (*TestDatabase, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	container, err := createContainer(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to create container: %w", err)
	}

	dbConnectionString, err := container.ConnectionString(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection string: %w", err)
	}

	host, err := container.Host(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get container host: %w", err)
	}
	if strings.Contains(strings.ToLower(dbConnectionString), "localhost") {
		dbConnectionString = strings.Replace(dbConnectionString, "localhost", host, 1)
	}

	if err := database.RunMigrations(dbConnectionString); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	// Snapshot must be taken before opening the pool. pgxpool with MinConns=1
	// immediately establishes a connection, and PostgreSQL refuses to clone a
	// database that has active connections (CREATE DATABASE … WITH TEMPLATE).
	if err := container.Snapshot(ctx); err != nil {
		return nil, fmt.Errorf("failed to create snapshot: %w", err)
	}

	dbPool, err := database.ConnectDB(dbConnectionString)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	defaultSeed, err := seedDatabase(dbPool, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to seed database: %w", err)
	}

	return &TestDatabase{
		DbPool:           dbPool,
		DefaultData:      defaultSeed,
		ConnectionString: dbConnectionString,
		container:        container,
	}, nil
}

func (tdb *TestDatabase) TearDown() {
	if tdb.DbPool != nil {
		tdb.DbPool.Close()
	}
	if tdb.container != nil {
		_ = tdb.container.Terminate(context.Background())
	}
}

func (tdb *TestDatabase) Reset() error {
	if tdb.container == nil {
		return fmt.Errorf("container is not initialized")
	}

	// Drop the validator's process-wide schema cache so subtests don't see
	// each other's MetadataField rows after a DB rollback. Without this,
	// `WhenNoFieldsDeclared` style tests would observe a cache entry left
	// behind by the previous subtest that did declare fields.
	validator.ClearCache()

	if err := tdb.container.Restore(context.Background()); err != nil {
		return fmt.Errorf("failed to restore container: %w", err)
	}

	// Wait for DB to be ready to accept connections
	err := waitForDB(tdb.DbPool, 10, time.Second*1)
	if err != nil {
		return fmt.Errorf("database did not become ready after restore: %w", err)
	}

	defaultSeed, err := seedDatabase(tdb.DbPool, tdb.DefaultData)
	if err != nil {
		return fmt.Errorf("failed to seed database: %w", err)
	}

	tdb.DefaultData = defaultSeed
	return nil
}

func waitForDB(pool *pgxpool.Pool, attempts int, delay time.Duration) error {
	ctx := context.Background()
	for range attempts {
		err := pool.Ping(ctx)
		if err == nil {
			return nil
		}
		time.Sleep(delay)
	}
	return fmt.Errorf("database not responding after %d attempts", attempts)
}

func createContainer(ctx context.Context) (*postgres.PostgresContainer, error) {
	pgContainer, err := postgres.Run(
		ctx,
		"postgres:17-alpine",
		postgres.WithDatabase("kaiten"),
		postgres.WithUsername("kaiten"),
		postgres.WithPassword("kaiten"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to start postgres container: %w", err)
	}

	return pgContainer, nil
}

func seedDatabase(pool *pgxpool.Pool, existing *TestData) (*TestData, error) {
	ctx := context.Background()
	userID, organizationID := uuid.New(), uuid.New()
	name := "Test User"
	if existing != nil {
		userID = existing.UserID
		organizationID = existing.OrganizationID
		if existing.Name != "" {
			name = existing.Name
		}
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if err != nil {
			if rbErr := tx.Rollback(ctx); rbErr != nil {
				fmt.Printf("failed to rollback transaction: %v\n", rbErr)
			}
		}
	}()

	queries := []struct {
		query string
		args  []interface{}
	}{
		{"INSERT INTO organization (id, external_id, name) VALUES ($1, $2, 'Test Organization')", []interface{}{organizationID, "organization-external-1"}},
		{"INSERT INTO \"user\" (id, external_id, email, name) VALUES ($1, $2, 'test@example.com', $3)", []interface{}{userID, "user-external-1", name}},
		{"INSERT INTO user_on_organization (organization_id, user_id) VALUES ($1, $2)", []interface{}{organizationID, userID}},
	}

	for _, q := range queries {
		if _, err := tx.Exec(ctx, q.query, q.args...); err != nil {
			return nil, fmt.Errorf("failed to execute query: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &TestData{
		UserID:         userID,
		Name:           name,
		OrganizationID: organizationID,
	}, nil
}
