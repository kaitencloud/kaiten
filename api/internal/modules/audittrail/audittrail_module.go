package audittrail

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
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
}

// NewUseCases creates a new UseCases instance with all handlers initialized.
//
// announcer may be nil, and is for every driver that serves no HTTP: it is how
// the notifications module learns that an entry was written, and a process with
// no open streams has nobody to tell. See subscriber.Announcer.
func NewUseCases(svc services.Container, announcer subscriber.Announcer) *UseCases {
	return &UseCases{
		Subscriber: subscriber.New(svc.Uof, svc.UserProvider, announcer),
	}
}
