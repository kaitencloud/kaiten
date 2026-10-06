package kaiten

import (
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// ErrBackgroundWorkersWithoutDatabase is returned by New when a driver asks for
// background work without giving the application a database.
//
// It is an error rather than a degradation because every background worker in the
// tree exists to talk to Postgres: the pgnotify listeners LISTEN on it, the
// retention sweeps DELETE from it, the evaluation publisher writes outbox rows to
// it. A process that wanted all three and got none of them would look healthy and
// quietly stop invalidating caches on its peers.
var ErrBackgroundWorkersWithoutDatabase = errors.New(
	"kaiten: BackgroundWorkers requires a database connection pool")

// Options is everything the application needs from whoever drives it.
//
// There is deliberately no PgNotifyConnConfig field. The LISTEN template is
// derived from DB (see newModules), because "does this process run background
// work" and "has it got somewhere to LISTEN" were never two decisions -- and
// while they were two fields, they disagreed. Pairing them structurally is what
// lets services.Container.NewPgNotifyListener treat a mismatch as a wiring bug
// instead of a supported configuration.
type Options struct {
	// DB is the pool every module builds its own generated sqlc client from.
	//
	// Nil is legal and means "construct the application without touching
	// Postgres": cmd/docs builds one purely to walk the route table and emit the
	// OpenAPI documents, and never executes a query.
	DB *pgxpool.Pool

	// Config is the settings the use cases read -- retention windows, the
	// dogfooding organization, the connectors vault path. Not config.Config: a
	// driver that serves no HTTP should not have to invent a port or a signing
	// key to construct the application. See config.CoreConfig.
	Config config.CoreConfig

	// UserProvider answers "which user, in which organization, is acting" for the
	// use cases that need it.
	//
	// It is an Option rather than a constant because the drivers genuinely differ
	// today: the server reads it from the request context, the seeder pins it to
	// the organization it is seeding, and cmd/docs supplies none because nothing
	// it does reaches a handler. Once every operation is reached through a facade
	// method, identity arrives with the call instead -- a caller, bound into the
	// context -- and the context-reading provider becomes the only one there is.
	UserProvider currentuser.Provider

	// UsageReporter meters entitlement usage. Nil is legal and becomes
	// services.NoopUsageReporter, so a driver that does not report never has to
	// say so twice.
	UsageReporter services.UsageReporter

	// ConnectorEntitlements answers whether an organization's license permits a
	// connector. Nil is legal and becomes services.AlwaysEntitled, which is what a
	// self-hosted deployment wants: there is no licensing authority to ask, so every
	// registered connector is available to every organization.
	ConnectorEntitlements services.ConnectorEntitlements

	// EntitlementConfig reads the settings an organization's licence states, such
	// as how long its usage history is kept. Nil is legal and becomes
	// services.NoLicensingAuthority: a self-hosted deployment reads those settings
	// from its own configuration.
	EntitlementConfig services.EntitlementConfig

	// BillingProviders resolves the payment providers invoices are issued
	// through. Nil is legal and becomes NOOP alone: the organization collects
	// its invoices itself.
	BillingProviders provider.Registry

	// BackgroundWorkers is whether this process runs background work: the
	// pgnotify listeners, the retired-token sweep, the feature-flag evaluation
	// publisher.
	//
	// It stays an explicit option, and is not inferred from DB, because it is a
	// real decision that a pool does not answer: cmd/admin-tools and the seeder
	// both hold a pool and neither has any business running a sweep it cannot
	// drain. New refuses the one combination that cannot work -- workers without
	// a pool -- and leaves the other three to the driver.
	BackgroundWorkers bool
}

// Kaiten is a constructed application: every module wired, every background
// worker this process is meant to run started, and one shutdown to drain them.
//
// Build one per process. Modules are not pure constructors -- identity opens a
// pgnotify LISTEN connection and owns a token cache, metadatafields owns another
// listener -- so two Kaitens in one process means two listeners racing to
// invalidate two caches, only one of which anything is reading from.
type Kaiten struct {
	modules modules

	// workers collects the shutdown hooks of everything this application started,
	// plus anything a driver registers through OnStop. Never nil: modules register
	// unconditionally, and a stop hook dropped because the registry happened to be
	// nil is a worker nothing can stop.
	workers *services.WorkerRegistry
}

// New constructs the application.
//
// It returns an error only for a combination that cannot work, not for a missing
// dependency: a nil pool, a nil reporter and a nil signing key are all valid
// answers for some driver, and each is documented on the Option that takes it.
//
// Assembling the CDC fan-out is the second such combination. Two consumers sharing a
// name would share one inbox row and each would read the other's work as its own,
// which is a wiring mistake with no runtime symptom -- so it is refused here, where a
// driver still has somewhere to report it, rather than at the first delivery.
func New(opts Options) (*Kaiten, error) {
	if opts.BackgroundWorkers && opts.DB == nil {
		return nil, ErrBackgroundWorkersWithoutDatabase
	}

	workers := &services.WorkerRegistry{}

	built, err := newModules(opts, workers)
	if err != nil {
		return nil, err
	}

	return &Kaiten{
		modules: built,
		workers: workers,
	}, nil
}

// OnStop registers fn to run when Close is called.
//
// It is here so a driver's own background work shuts down with the application's
// rather than beside it: the HTTP server's transport-table retention sweep is
// started by the server, not by a module, and there is no second shutdown for it
// to belong to. One Close drains everything the process started.
func (k *Kaiten) OnStop(fn func()) {
	k.workers.OnStop(fn)
}

// Close stops every background worker this application started, in the order
// they were registered, and blocks until each has stopped.
//
// It returns nothing because there is nothing to report: a stop hook drains a
// goroutine it owns and either returns or does not. Callers already sit in a
// shutdown path with an error of their own; giving them a second one that is
// always nil would only invite them to ignore it.
//
// Safe to call on an application that started nothing.
func (k *Kaiten) Close() {
	k.workers.StopAll()
}
