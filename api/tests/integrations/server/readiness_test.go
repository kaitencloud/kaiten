// Package server_test exercises the /api/readyz schema-version gate against
// a real Postgres instance. It lives here rather than in
// internal/infrastructure/http/server's own unit tests because it needs a
// database that starts out *without* goose_db_version — the shared
// tests.TestDatabase helper always migrates before handing back a pool, so
// it can't represent the "not migrated yet" state this test depends on.
package server_test

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	_ "github.com/lib/pq" // used by testcontainers for snapshots
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/server"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/attio"
)

// TestReadyzGatesOnSchemaVersion starts a fresh, unmigrated Postgres
// container, boots a server against it, and asserts readyz returns 503
// before kaiten-admin-tools' migrations have run and 200 immediately after.
//
// It also pins what the gate is for. Booting against an unmigrated database is a
// legitimate state -- the migration Job is expected to finish first, and this gate is
// what makes a violated ordering a 503 rather than a crashloop -- so the startup work
// that needs a schema must defer to the probe rather than fail construction. Built-in
// connector registration is that work, and the row asserted at the end is the proof
// that deferring it does not mean skipping it.
func TestReadyzGatesOnSchemaVersion(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	container, err := postgres.Run(
		ctx,
		"postgres:17-alpine",
		postgres.WithDatabase("kaiten"),
		postgres.WithUsername("kaiten"),
		postgres.WithPassword("kaiten"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatalf("failed to start postgres container: %v", err)
	}
	t.Cleanup(func() {
		_ = container.Terminate(context.Background())
	})

	connString, err := container.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("failed to get connection string: %v", err)
	}
	host, err := container.Host(ctx)
	if err != nil {
		t.Fatalf("failed to get container host: %v", err)
	}
	if strings.Contains(strings.ToLower(connString), "localhost") {
		connString = strings.Replace(connString, "localhost", host, 1)
	}

	pool, err := database.ConnectDB(connString)
	if err != nil {
		t.Fatalf("failed to connect to database: %v", err)
	}
	t.Cleanup(pool.Close)

	s, err := server.New(context.Background(), server.Dependencies{
		DB: pool,
	}, config.Config{})
	if err != nil {
		t.Fatalf("server.New() error = %v", err)
	}

	assertReadyz := func(wantStatus int) {
		t.Helper()

		req := httptest.NewRequest("GET", "/api/readyz", nil)
		resp, err := s.Router().Test(req, fiber.TestConfig{})
		if err != nil {
			t.Fatalf("readyz request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != wantStatus {
			t.Fatalf("readyz status = %d, want %d", resp.StatusCode, wantStatus)
		}
	}

	assertReadyz(503)

	if err := database.RunMigrations(connString); err != nil {
		t.Fatalf("RunMigrations() error = %v", err)
	}

	assertReadyz(200)

	// Registration could not happen at construction: there was no connector table
	// to write to. The probe that flipped readyz to 200 is what did it, which is
	// what keeps "started before the migration" from meaning "joined the Service
	// with a shipped connector unregistered".
	var registered int
	if err := pool.QueryRow(
		ctx, `SELECT count(*) FROM "connector" WHERE "name" = $1`, attio.Name,
	).Scan(&registered); err != nil {
		t.Fatalf("counting connector rows: %v", err)
	}
	if registered != 1 {
		t.Fatalf("connector rows for %s = %d, want 1", attio.Name, registered)
	}
}
