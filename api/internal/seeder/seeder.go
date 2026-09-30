// Package seeder provides a framework for seeding the database with test data.
// It supports multiple profiles that can be selected at runtime and uses
// the application's use cases to ensure data consistency.
package seeder

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/components"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Profile defines the interface that all seed profiles must implement.
type Profile interface {
	// Name returns the unique identifier for this profile.
	Name() string
	// Description returns a human-readable description of what this profile seeds.
	Description() string
	// Seed executes the seeding logic using the provided context.
	Seed(ctx context.Context, sc *SeederContext) error
}

// SeederContext provides access to all modules' use cases and direct database queries.
// It encapsulates the dependencies needed by seed profiles.
type SeederContext struct {
	// Module use cases
	Components      *components.UseCases
	Customers       *customers.UseCases
	DeploymentZones *deploymentzones.UseCases
	Entitlements    *entitlements.UseCases
	FeatureFlags    *featureflags.UseCases
	Identity        *identity.UseCases
	Instances       *instances.UseCases
	Licenses        *licenses.UseCases
	MetadataFields  *metadatafields.UseCases
	Releases        *releases.UseCases

	// OrganizationID the context is scoped to — zero on the root context, set by
	// WithOrganization. Exposed so seeders can write org-scoped SQL directly for
	// the few things no use case covers.
	OrganizationID uuid.UUID

	// Internal dependencies for creating org-scoped contexts
	pool          *pgxpool.Pool
	usageReporter services.UsageReporter
}

// NewSeederContext creates a new SeederContext with all dependencies initialized.
// The initial context has no organization/user set - use WithOrganization to create
// org-scoped contexts for seeding. A nil usageReporter is fine and becomes a no-op
// one; the funnel lives in the application now (see kaiten.Options.UsageReporter),
// so this package no longer has to remember it.
func NewSeederContext(pool *pgxpool.Pool, usageReporter services.UsageReporter) *SeederContext {
	return &SeederContext{
		pool:          pool,
		usageReporter: usageReporter,
	}
}

// WithOrganization returns a new SeederContext scoped to the specified organization and user.
// This constructs an application whose user provider is pinned to that organization
// and user, allowing the seeder to create resources as if authenticated as them.
//
// The application is built here, per organization, because that is currently the
// only place identity can be attached: the modules read it off the container, so
// pinning a different user means building a different graph. Once the seeder calls
// use cases through facade methods, identity travels with the call as a
// caller.Static and this becomes a namespace lookup with no construction at all.
//
// It replaces a hand-rolled services.Container that carried four of seven fields.
// The three it omitted were not a simplification: with no WorkerRegistry, the
// token-retention sweeper it started had nothing to stop it, and the only reason
// that never surfaced is that a zero retention window made tokenretention.New
// return nil. BackgroundWorkers: false now says the intent outright, and the
// container it says it to is the same one the server builds.
func (sc *SeederContext) WithOrganization(orgID, userID uuid.UUID) *SeederContext {
	app, err := kaiten.New(kaiten.Options{
		DB: sc.pool,
		// Zero CoreConfig: seeding is driven by profiles and a pool, and takes no
		// settings. Note this is now merely the absence of configuration -- it used
		// to be what accidentally kept an unstoppable worker from starting.
		UserProvider: &currentuser.StaticUserProvider{
			UserID:         userID,
			OrganizationID: orgID,
		},
		UsageReporter: sc.usageReporter,
		// Seeding runs use cases and exits. It has no shutdown to drain workers
		// into, so it starts none -- which is also why the application can be
		// discarded here rather than held and closed: with no workers, nothing
		// registered a stop hook and Close would drain nothing. A future caller
		// that wants workers must keep the *kaiten.Kaiten and Close it.
		BackgroundWorkers: false,
		// No platform signing key: the seeder never registers the Fiber route that
		// mints platform JWTs, so it has nothing to sign. See kaiten.Options.
	})
	if err != nil {
		// Unreachable. New returns an error for exactly one combination --
		// background workers without a pool -- and this is the call site that
		// passes false. Panicking rather than widening WithOrganization's signature
		// keeps six profiles and two tests from handling an error the type system
		// has already ruled out, and construction leaves this function again in the
		// commit that gives the seeder facade methods.
		panic(fmt.Sprintf("seeder: construct application: %v", err))
	}

	// The application constructs all fifteen modules; the ten surfaced here are the
	// ones seed profiles actually drive. The rest are reachable through the facade
	// when a profile needs them, which is a better place to ask for them than a
	// public field nothing reads.
	m := app.Modules()

	return &SeederContext{
		Components:      m.Components,
		Customers:       m.Customers,
		DeploymentZones: m.DeploymentZones,
		Entitlements:    m.Entitlements,
		FeatureFlags:    m.FeatureFlags,
		Identity:        m.Identity,
		Instances:       m.Instances,
		Licenses:        m.Licenses,
		MetadataFields:  m.MetadataFields,
		Releases:        m.Releases,
		OrganizationID:  orgID,
		pool:            sc.pool,
		usageReporter:   sc.usageReporter,
	}
}

// Pool exposes the underlying connection pool so seed profiles outside this
// package can build a module's own db.Queries for reads use cases don't
// cover (e.g. reconciling after a unique violation), the same way Queries
// covers the organization/user tables use cases never touch.
func (sc *SeederContext) Pool() *pgxpool.Pool {
	return sc.pool
}

// Exec allows seed profiles to run targeted SQL adjustments when use cases do
// not expose specific writable fields (e.g. synthetic timeline data).
func (sc *SeederContext) Exec(ctx context.Context, query string, args ...any) error {
	if _, err := sc.pool.Exec(ctx, query, args...); err != nil {
		return fmt.Errorf("seeder exec failed: %w", err)
	}
	return nil
}
