package audittrail

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/auditretention"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/subscriber"
)

// UseCases contains all the use case handlers for the audittrail module.
//
// The event subscriber is this module's only entry point today. Its two read use
// cases -- listforinstance and listfororganization -- are in-process ports
// consumed by other modules and by the GraphQL resolvers, which build them
// themselves; they are not wired here because nothing this module publishes needs
// them.
type UseCases struct {
	Subscriber *subscriber.Consumer

	// Retention is the sweep that bounds audit_trail to each organization's
	// retention. Nil where no background work runs; Start and Stop are nil-safe.
	Retention *auditretention.Job
}

// NewUseCases creates a new UseCases instance with all handlers initialized.
//
// announcer may be nil, and is for every driver that serves no HTTP: it is how
// the notifications module learns that an entry was written, and a process with
// no open streams has nobody to tell. See subscriber.Announcer.
func NewUseCases(svc services.Container, announcer subscriber.Announcer) *UseCases {
	useCases := &UseCases{
		Subscriber: subscriber.New(svc.Uof, svc.UserProvider, announcer),
	}

	// audit_trail is this module's table, so this module bounds it -- the shape
	// of identity's token retention and of the usage-ledger maintenance: shared
	// scheduler and election, its own window and SQL. Guarded on
	// BackgroundWorkers like every other sweep, and on the retention switch, so an
	// operator who turned retention off gets no sweep at all rather than one
	// with a window it cannot see.
	if svc.BackgroundWorkers && svc.Pool != nil && svc.Config.Retention.Enabled {
		useCases.Retention = auditretention.New(svc.Pool, svc.EntitlementConfig, auditretention.Config{
			InitialDelay: svc.Config.Retention.InitialDelay,
			Interval:     svc.Config.Retention.Interval,
			BatchSize:    svc.Config.Retention.BatchSize,
			Settings:     auditretention.Settings{RetentionDays: svc.Config.Retention.AuditTrailDays},
		})
		useCases.Retention.Start(context.Background())
		svc.WorkerRegistry.OnStop(useCases.Retention.Stop)
	}
	return useCases
}
