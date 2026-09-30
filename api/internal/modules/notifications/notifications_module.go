// Package notifications is the in-app notification feed: a per-user view over the
// organization's audit trail, with read state, subscriptions and a live stream.
//
// There is no notification table: a notification is an audit_trail row seen by
// a user, and the audit trail already stores every event once per organization.
// What is per-user is read state and subscription.
package notifications

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/announce"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/feed"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/getpreferences"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/hub"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/listnotifications"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/markread"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/putpreferences"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/stream"
)

// maxStreamsPerReplica bounds the SSE connections one process holds. Two
// replicas serve every tab of every signed-in user, and each stream costs a
// goroutine and a socket, so the ceiling is explicit rather than "whatever the
// pod survives". Past it the handler answers 503 and the client's own backoff
// spreads the retry.
const maxStreamsPerReplica = 500

type UseCases struct {
	ListNotifications *listnotifications.UseCase
	MarkRead          *markread.UseCase
	GetPreferences    *getpreferences.UseCase
	Stream            *stream.UseCase
	PutPreferences    *putpreferences.UseCase

	// Hub and Reader are what the SSE transport needs; it is an HTTP concern
	// living in internal/infrastructure/http, so they are exposed rather than
	// wrapped in a use case that would only pass them through.
	Hub    *hub.Hub
	Reader feed.Reader

	// Announcer is handed to the audit trail consumer, which is what publishes
	// on commit -- see the package comment in ./announce for why it cannot be a
	// consumer of its own.
	Announcer *announce.Publisher
}

func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Pool)
	txQueries := func(dbtx uow.DBTX) *db.Queries { return db.New(dbtx) }

	streams := hub.New(maxStreamsPerReplica)

	useCases := &UseCases{
		ListNotifications: listnotifications.NewUseCase(queries),
		MarkRead:          markread.NewUseCase(svc.Uof, txQueries, queries),
		GetPreferences:    getpreferences.NewUseCase(queries),
		Stream:            stream.NewUseCase(queries),
		PutPreferences:    putpreferences.NewUseCase(svc.Uof, txQueries),
		Hub:               streams,
		Reader:            queries,
		Announcer:         announce.NewPublisher(),
	}

	useCases.listen(svc, queries, streams)

	return useCases
}

// listen subscribes this replica to the two notification channels.
//
// Own listener, like identity's: a module that needs LISTEN builds, starts and
// registers its own, so the set of channels a process watches is readable from
// the modules it runs rather than from one central list.
//
// A replica that fails to listen still serves the feed correctly -- the stream is
// a hint and the client refetches on reconnect -- so this logs and carries on
// instead of failing the process.
func (uc *UseCases) listen(svc services.Container, queries *db.Queries, streams *hub.Hub) {
	listener := svc.NewPgNotifyListener("notifications")
	if listener == nil {
		return
	}

	listener.Register(announce.Channel, func(ctx context.Context, payload string) {
		event, ok := announce.ParseEvent(payload)
		if !ok {
			slog.WarnContext(ctx, "notifications: unreadable announcement", "payload", payload)

			return
		}

		uc.fanOut(ctx, queries, streams, event)
	})

	listener.Register(announce.PreferenceChannel, func(_ context.Context, payload string) {
		userID, err := uuid.Parse(payload)
		if err != nil {
			return
		}

		streams.InvalidateSubscription(userID)
	})

	if err := listener.Start(context.Background()); err != nil {
		slog.Error("notifications: failed to start pgnotify listener; open streams will not receive live updates until they reconnect",
			"error", err)

		return
	}

	svc.WorkerRegistry.OnStop(listener.Stop)
}

// fanOut turns one announcement into one frame per interested local connection.
//
// The per-connection work is a subscription resolve (only when the cached one was
// invalidated), a render and a count -- done outside the hub's lock, because the
// hub is also serving connects and disconnects while this runs.
func (uc *UseCases) fanOut(ctx context.Context, queries *db.Queries, streams *hub.Hub, event announce.Event) {
	recipients := streams.Recipients(event.OrganizationID, event.EventName)
	if len(recipients) == 0 {
		return
	}

	notification, visible, err := feed.One(ctx, queries, recipients[0].UserID, event.OrganizationID, event.NotificationID)
	if err != nil || !visible {
		if err != nil {
			slog.WarnContext(ctx, "notifications: failed to read announced notification",
				"notification_id", event.NotificationID, "error", err)
		}

		return
	}

	for _, connection := range recipients {
		subscription, err := feed.SubscriptionFor(ctx, queries, connection.UserID, catalogue.ChannelInApp)
		if err != nil {
			continue
		}
		connection.SetSubscription(subscription)

		if !subscription.Subscribed(event.EventName) {
			continue
		}

		unread, err := feed.Unread(ctx, queries, connection.UserID, connection.OrganizationID, subscription)
		if err != nil {
			continue
		}

		connection.Send(hub.Frame{Name: hub.FrameNotification, Data: map[string]any{
			"notification": notification,
			"unreadCount":  unread,
		}})
	}
}
