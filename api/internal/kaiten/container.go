package kaiten

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/cdc"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail"
	"github.com/kaitencloud/kaiten/api/internal/modules/components"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases"
	"github.com/kaitencloud/kaiten/api/internal/modules/users"
)

// modules is every module, constructed. It is what the facade namespaces read
// through, and it is unexported so that reading through it is the facade's
// privilege rather than anyone's option.
type modules struct {
	AuditTrail      *audittrail.UseCases
	Components      *components.UseCases
	Connectors      *connectors.UseCases
	Customers       *customers.UseCases
	DeploymentZones *deploymentzones.UseCases
	Entitlements    *entitlements.UseCases
	FeatureFlags    *featureflags.UseCases
	Notifications   *notifications.UseCases
	Identity        *identity.UseCases
	Instances       *instances.UseCases
	Integrations    *integrations.UseCases
	Licenses        *licenses.UseCases
	MetadataFields  *metadatafields.UseCases
	Organization    *organization.UseCases
	Releases        *releases.UseCases
	Users           *users.UseCases

	// CDC is the fan-out over the in-process consumers of the CDC stream. Not a
	// module: it owns no tables and publishes no operation, it is the thing that
	// runs several modules' consumers against one delivery. It is built here because
	// it needs those modules, and here is where they exist.
	CDC *cdc.Dispatcher
}

// Modules is the subset of constructed modules a driver still reaches directly.
//
// TRANSITIONAL, and deliberately a separate type from the storage above, so
// adding a field is a visible decision and removing one is progress. A field
// goes when the *last* driver naming it moves: the modules left here are the
// ones internal/seeder's profiles call use cases on directly, and they leave
// with the seeder.
//
// Identity is permanent. validatetoken and validateplatformtoken take their use
// case by design -- they authenticate rather than act, so there is no caller to
// hand them; a caller is what they produce.
//
// Nothing new should be built on this. A driver that needs a use case wants a
// facade method, and adding it is the work rather than reaching around it.
type Modules struct {
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
}

// Modules returns the modules a driver still reaches directly. See the Modules
// type: this is a transitional handoff, not part of the facade.
//
// Built field by field rather than returned wholesale, so the exported handoff can
// shrink independently of the storage it reads from.
func (k *Kaiten) Modules() Modules {
	return Modules{
		Components:      k.modules.Components,
		Customers:       k.modules.Customers,
		DeploymentZones: k.modules.DeploymentZones,
		Entitlements:    k.modules.Entitlements,
		FeatureFlags:    k.modules.FeatureFlags,
		Identity:        k.modules.Identity,
		Instances:       k.modules.Instances,
		Licenses:        k.modules.Licenses,
		MetadataFields:  k.modules.MetadataFields,
		Releases:        k.modules.Releases,
	}
}

// newModules builds the container and every module from it.
//
// This is the only services.Container composite literal in the tree, and that is
// the point of the package. A module needs seven things and reads them off one
// struct; the value of assembling that struct exactly once is that a driver
// cannot supply six of them and discover which one it forgot from a nil panic in
// production -- which is what the seeder's hand-rolled four-field copy was doing,
// saved from an unstoppable retention sweeper only by a zero window it never
// meant to configure.
//
// Every module is constructed exactly once here, and no module is constructed
// anywhere else. NewUseCases is not a pure function for all of them: identity
// starts a pgnotify LISTEN connection and owns the token cache its handlers read
// through, metadatafields does the same for the schema-validation cache, and
// featureflags starts the goroutines that drain its evaluation publisher. Calling
// one of those twice does not produce two equivalent graphs -- it produces two
// listeners racing to invalidate two caches, one of which nothing is reading.
func newModules(opts Options, workers *services.WorkerRegistry) (modules, error) {
	svc := services.Container{
		Pool:         opts.DB,
		Uof:          uow.NewUnitOfWork(opts.DB),
		UserProvider: opts.UserProvider,
		Config:       opts.Config,
		// Through the funnel rather than straight across, so a driver that does not
		// meter usage says so by leaving the option nil and every handler still
		// reports unconditionally. See services.UsageReporterOrNoop.
		UsageReporter: services.UsageReporterOrNoop(opts.UsageReporter),
		// Same funnel, same reason: a deployment that licenses nothing says so by
		// leaving the option nil, and every use case still asks unconditionally.
		ConnectorEntitlements: services.ConnectorEntitlementsOrAlways(opts.ConnectorEntitlements),
		EntitlementConfig:     services.EntitlementConfigOrNone(opts.EntitlementConfig),
		WorkerRegistry:        workers,
		BackgroundWorkers:     opts.BackgroundWorkers,
	}

	// The template for the dedicated Postgres LISTEN connections the two
	// cache-owning modules dial (see internal/infrastructure/pgnotify), derived
	// from the pool rather than taken as an Option: no driver has ever wanted a
	// different one, and deriving it is what makes "runs workers" imply "can
	// LISTEN" structurally instead of by convention. New has already refused the
	// combination where that implication would break.
	if opts.DB != nil {
		svc.PgNotifyConnConfig = opts.DB.Config().ConnConfig.Copy()
	}

	// Built before the modules map, because two of them need it: notifications
	// owns the streams, and the audit trail consumer announces on its behalf --
	// from inside the transaction that writes the entry, which is the whole
	// reason the announcement is not a CDC consumer of its own.
	notificationModule := notifications.NewUseCases(svc)

	built := modules{
		AuditTrail:      audittrail.NewUseCases(svc, notificationModule.Announcer),
		Components:      components.NewUseCases(svc),
		Connectors:      connectors.NewUseCases(svc),
		Customers:       customers.NewUseCases(svc),
		DeploymentZones: deploymentzones.NewUseCases(svc),
		Entitlements:    entitlements.NewUseCases(svc),
		FeatureFlags:    featureflags.NewUseCases(svc),
		Notifications:   notificationModule,
		Identity:        identity.NewUseCases(svc),
		Instances:       instances.NewUseCases(svc),
		Integrations:    integrations.NewUseCases(svc),
		Licenses:        licenses.NewUseCases(svc),
		MetadataFields:  metadatafields.NewUseCases(svc),
		Organization:    organization.NewUseCases(svc),
		Releases:        releases.NewUseCases(svc),
		Users:           users.NewUseCases(svc),
	}

	// A list, not a pipeline: the dispatcher runs these in parallel and waits for all
	// of them, so their order here is only the order failures are logged in. No
	// consumer may depend on another -- they share a delivery, not a transaction, and
	// cdc's package comment says so -- which is what makes a new in-process reader of
	// the CDC stream one more argument on this line.
	dispatcher, err := cdc.NewDispatcher(svc.Uof, built.AuditTrail.Subscriber, built.Connectors.Attio)
	if err != nil {
		return modules{}, err
	}
	built.CDC = dispatcher

	return built, nil
}
