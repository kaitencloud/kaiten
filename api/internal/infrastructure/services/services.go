package services

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/connectorhooks"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/pgnotify"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

type UsageReporter interface {
	// TrackAsync fires a usage report in the background.
	// The caller blocks under backpressure while the bounded report queue is saturated.
	TrackAsync(orgID uuid.UUID, entitlementSlug string)

	// DecrementAsync fires a -1 usage report in the background. Used for DELETE operations
	// to reduce the live count on the shared entitlement. The caller blocks under
	// backpressure while the bounded report queue is saturated.
	DecrementAsync(orgID uuid.UUID, entitlementSlug string)

	// ReportAndEnforce synchronously reports usage and enforces the configured threshold.
	// Returns dogfooding.ErrThresholdExceeded if the limit is reached.
	// On transient errors it returns a non-nil, non-ErrThresholdExceeded error, meaning
	// the limit is unknown. Callers do not choose what to do with that: they route it
	// through dogfooding.EnforceCreationLimit, which fails closed and refuses the
	// operation with a 503 — an unverifiable limit must never read as an unreached one.
	ReportAndEnforce(ctx context.Context, orgID uuid.UUID, entitlementSlug string) error

	// Decrement synchronously reports a -1 usage delta, undoing a prior
	// successful ReportAndEnforce increment. Callers use this to compensate
	// when the resource that increment was for fails to persist afterward
	// (see dogfooding.ClassifyEnforcementError's EnforcementAllowed case) —
	// otherwise the remote usage counter drifts permanently high for a
	// resource that was never created. No threshold enforcement is applied:
	// a decrement can never exceed a limit.
	Decrement(ctx context.Context, orgID uuid.UUID, entitlementSlug string) error
}

// NoopUsageReporter is a UsageReporter that reports nothing. Wiring
// substitutes it wherever the real dogfooding reporter is absent — the feature
// is off, the binary never reports, a test does not care — so UsageReporter is
// never nil and no call site has to ask whether reporting is on before
// reporting. An interface that is always satisfied cannot be forgotten at a new
// call site; a nil one will be.
type NoopUsageReporter struct{}

var _ UsageReporter = NoopUsageReporter{}

func (NoopUsageReporter) TrackAsync(uuid.UUID, string) {
	// Empty by design: with dogfooding off there is no usage to record, and
	// dropping the call here is what keeps every call site free of a nil check.
}

func (NoopUsageReporter) DecrementAsync(uuid.UUID, string) {
	// Empty for the same reason as TrackAsync.
}

// ReportAndEnforce reports nothing and therefore enforces nothing: a creation
// limit checked through a no-op reporter always allows, which is exactly what
// "dogfooding is disabled" means.
func (NoopUsageReporter) ReportAndEnforce(context.Context, uuid.UUID, string) error { return nil }

func (NoopUsageReporter) Decrement(context.Context, uuid.UUID, string) error { return nil }

// UsageReporterOrNoop returns reporter, or a NoopUsageReporter when reporter is
// nil. Every constructor that takes a reporter from outside its own package
// calls this once, so the value it stores — and everything wired from it — is
// always usable, whatever the caller had.
func UsageReporterOrNoop(reporter UsageReporter) UsageReporter {
	if reporter == nil {
		return NoopUsageReporter{}
	}
	return reporter
}

// ConnectorEntitlements answers whether an organization's license permits it to
// activate a connector.
//
// Separate from UsageReporter, and deliberately not a method on it, because the two
// are different questions about different things. Usage metering asks "may this
// organization create one more of these, and record that it did" -- it increments,
// which is exactly what a read of an activation page must not do. This asks "is this
// feature sold to this organization", which is a property of the license and changes
// only when somebody buys something.
//
// The slug names a BOOLEAN entitlement, so the answer comes back as the license grant
// itself rather than as a count measured against a cap.
type ConnectorEntitlements interface {
	// Entitled reports whether organizationID may activate the connector gated by
	// entitlementSlug.
	Entitled(ctx context.Context, organizationID uuid.UUID, entitlementSlug string) (bool, error)
}

// AlwaysEntitled permits every connector.
//
// What a deployment with no licensing authority gets, which is every self-hosted one:
// there is nobody to ask whether a connector is sold, because nobody sold it. Wiring
// substitutes it wherever the real checker is absent, for the reason
// NoopUsageReporter exists -- an interface that is always satisfied cannot be
// forgotten at a new call site.
//
// It is also what confines fail-closed entitlement checks to deployments that
// actually license: a caller behind this checker can never reach the refusal, so the
// two behaviours are separated by which checker is wired rather than by a flag either
// of them reads.
type AlwaysEntitled struct{}

var _ ConnectorEntitlements = AlwaysEntitled{}

func (AlwaysEntitled) Entitled(context.Context, uuid.UUID, string) (bool, error) {
	return true, nil
}

// ConnectorEntitlementsOrAlways returns checker, or AlwaysEntitled when checker is
// nil. See UsageReporterOrNoop.
func ConnectorEntitlementsOrAlways(checker ConnectorEntitlements) ConnectorEntitlements {
	if checker == nil {
		return AlwaysEntitled{}
	}
	return checker
}

// EntitlementConfig reads a CONFIG entitlement of an organization's licence: a
// setting the licence states, such as how long usage history is kept.
//
// Separate from ConnectorEntitlements for the same reason that one is separate from
// UsageReporter: a different question, and a different shape of answer.
type EntitlementConfig interface {
	// ConfigValue returns the entitlement's object value for organizationID, or
	// nil when the licence does not grant it. ErrNoLicensingAuthority means this
	// deployment has nobody to ask, and the caller falls back to its own
	// configuration; any other error means the value is unknown right now.
	ConfigValue(ctx context.Context, organizationID uuid.UUID, entitlementSlug string) (json.RawMessage, error)
}

// ErrNoLicensingAuthority is what EntitlementConfig answers on a deployment no
// licence governs: every self-hosted one, and the licensing deployment itself for
// its own organization.
var ErrNoLicensingAuthority = errors.New("no licensing authority answers for this organization")

// NoLicensingAuthority answers ErrNoLicensingAuthority for every setting. Wiring
// substitutes it wherever the real reader is absent, for the reason AlwaysEntitled
// exists.
type NoLicensingAuthority struct{}

var _ EntitlementConfig = NoLicensingAuthority{}

func (NoLicensingAuthority) ConfigValue(context.Context, uuid.UUID, string) (json.RawMessage, error) {
	return nil, ErrNoLicensingAuthority
}

// EntitlementConfigOrNone returns reader, or NoLicensingAuthority when reader is
// nil. See UsageReporterOrNoop.
func EntitlementConfigOrNone(reader EntitlementConfig) EntitlementConfig {
	if reader == nil {
		return NoLicensingAuthority{}
	}
	return reader
}

// WorkerRegistry collects shutdown hooks from modules that manage background workers.
// Each module calls OnStop during initialisation; the server calls StopAll once the
// HTTP router has finished draining in-flight requests.
type WorkerRegistry struct {
	mu      sync.Mutex
	stopFns []func()
}

// OnStop registers fn to be called when StopAll is invoked.
func (r *WorkerRegistry) OnStop(fn func()) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stopFns = append(r.stopFns, fn)
}

// StopAll calls every registered stop function in registration order.
func (r *WorkerRegistry) StopAll() {
	r.mu.Lock()
	fns := make([]func(), len(r.stopFns))
	copy(fns, r.stopFns)
	r.mu.Unlock()
	for _, fn := range fns {
		fn()
	}
}

// Container is the IoC container that holds all shared dependencies.
// It can be used by any module that needs access to the repository,
// unit of work, or user provider.
type Container struct {
	Pool          *pgxpool.Pool
	Uof           *uow.UnitOfWork
	UserProvider  currentuser.Provider
	Config        config.CoreConfig
	UsageReporter UsageReporter

	// ConnectorEntitlements answers whether an organization's license permits a
	// connector. Never nil: see ConnectorEntitlementsOrAlways.
	ConnectorEntitlements ConnectorEntitlements

	// EntitlementConfig reads the settings an organization's licence states.
	// Never nil: see EntitlementConfigOrNone.
	EntitlementConfig EntitlementConfig

	// BillingProviders resolves the payment providers invoices are issued
	// through. Never nil: NOOP alone when the driver registers none.
	BillingProviders provider.Registry

	// ConnectorHooks are the lifecycle rules of the connectors that have
	// their own (a payment provider's), by connector name. Nil has none.
	ConnectorHooks connectorhooks.Registry

	// WorkerRegistry is never nil, so a module registers its shutdown hook
	// unconditionally rather than asking whether anyone is collecting them. A
	// worker whose Stop hook was dropped because the registry was nil is a worker
	// nothing can stop.
	WorkerRegistry *WorkerRegistry

	// BackgroundWorkers is whether this process runs background work: pgnotify
	// listeners, retention sweeps, the feature-flag evaluation publisher.
	BackgroundWorkers bool

	// PgNotifyConnConfig is a template for dialing a dedicated Postgres
	// LISTEN connection (see internal/infrastructure/pgnotify), used today
	// for cross-replica cache invalidation. Required whenever
	// BackgroundWorkers is set, and read only through NewPgNotifyListener.
	// A module builds and owns its own Listener rather than sharing one off the
	// Container, so its Register/Start/Stop lifecycle lives entirely at
	// module level (see identity_module.go and metadatafield_module.go).
	PgNotifyConnConfig *pgx.ConnConfig
}

// NewPgNotifyListener returns a Listener for a module that wants cross-replica
// notifications, or nil when this process runs no background workers.
//
// It exists so the two modules that need one ask a single question -- "is a
// listener my job here?" -- instead of each restating the answer out of
// PgNotifyConnConfig and WorkerRegistry, which is how the guards drifted apart
// in the first place. The module keeps ownership of everything that follows:
// Register, Start, and the stop hook are still its own, because which channels
// it listens on and what a dropped notification costs it are module knowledge.
//
// A container that runs workers but carries no connection template is a wiring
// bug, and this is the one place that can say so. It says so and returns nil
// rather than panicking inside pgnotify.NewListener, because losing
// cross-replica invalidation degrades to TTL-only staleness -- which the callers
// already handle, and which is not worth taking a process down for.
func (c Container) NewPgNotifyListener(module string) *pgnotify.Listener {
	if !c.BackgroundWorkers {
		return nil
	}
	if c.PgNotifyConnConfig == nil {
		slog.Error("background workers are enabled but no pgnotify connection template was supplied; cross-replica cache invalidation falls back to TTL-only staleness",
			"module", module)
		return nil
	}

	return pgnotify.NewListener(c.PgNotifyConnConfig)
}
