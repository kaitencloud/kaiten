package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// openPool connects to the database and refuses to go any further unless the
// schema is at the version this binary was built against.
//
// Every command below depends on schema this binary's own migrations introduce -
// token.kind, the platform partial indexes, the system:kaiten row - so running
// against an older database would fail deep inside a query with a Postgres error
// naming a missing column. Refusing up front names the fix instead, and it is
// what lets each credential command be an ordinary step after the migrator in a
// compose chain or a Helm hook without either step knowing anything about the
// other.
//
// The gate belongs here rather than inside the application, because it is a
// property of this binary: it ships the migrations, so it is the one process that
// knows which schema version its code was built against.
func openPool(ctx context.Context) (*pgxpool.Pool, error) {
	dsn, err := connStringFromEnv()
	if err != nil {
		return nil, err
	}

	pool, err := database.ConnectDB(dsn)
	if err != nil {
		return nil, fmt.Errorf("error connecting to database: %w", err)
	}

	current, err := database.IsSchemaCurrent(ctx, pool)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("error checking the database schema version: %w", err)
	}
	if !current {
		pool.Close()
		return nil, errors.New(
			"database schema is behind what this binary expects - " +
				"run `kaiten-admin-tools migrate up` first",
		)
	}

	return pool, nil
}

// openApplication constructs the application every command below runs through,
// and returns the cleanup that shuts it down.
func openApplication(ctx context.Context) (*kaiten.Kaiten, func(), error) {
	pool, err := openPool(ctx)
	if err != nil {
		return nil, nil, err
	}

	app, err := kaiten.New(kaiten.Options{
		DB:                pool,
		BackgroundWorkers: false,
	})
	if err != nil {
		pool.Close()
		return nil, nil, fmt.Errorf("error constructing the application: %w", err)
	}

	return app, func() {
		app.Close()
		pool.Close()
	}, nil
}

// localPlatform is the caller this binary presents to the four operations the
// Platform API also publishes: `organization delete`, `organization membership
// delete`, `user delete` and `service-token mint`.
//
// It carries every scope, and that grants nothing. A process holding
// KAITEN_DATABASE_CONNECTION_STRING can already run each of those statements by
// hand -- that is what this file's commands did until they were routed here. What
// the constructor does is route existing authority through the use cases, so the
// invariants, the outbox events and the cache evictions happen instead of being
// re-derived here or, as they were, skipped. The narrowing that matters for a
// platform credential is the narrowing of what a *remote* holder of one can do, and
// that is caller.Platform's business, reading scopes off a token this binary is the
// only issuer of.
//
// One function rather than caller.LocalPlatform(scope.AllScopes()) written out at
// four call sites: an all-scopes caller is a privilege construct, and it should be
// one grep with one doc comment rather than four literals a reader has to notice.
// caller.LocalPlatform's own comment carries the other half of the reasoning,
// including why the platform token id it leaves at uuid.Nil is load-bearing.
func localPlatform() caller.PlatformCaller {
	return caller.LocalPlatform(scope.AllScopes())
}
