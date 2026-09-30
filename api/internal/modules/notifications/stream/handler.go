package stream

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/feed"
)

// Session is what a stream needs before it opens: resolved once, so the first
// frame is already correct rather than being corrected by the refetch the client
// does on connect.
type Session struct {
	Subscription feed.Subscription
	UnreadCount  int
}

type UseCase struct {
	reader feed.Reader
}

func NewUseCase(reader feed.Reader) *UseCase {
	return &UseCase{reader: reader}
}

// Execute resolves the caller's subscription and unread count.
//
// A user subscribed to nothing still gets a session, and a connection: their
// preferences can change while the stream is open, and the replica is told when
// they do.
func (uc *UseCase) Execute(ctx context.Context, userID, organizationID uuid.UUID) (Session, error) {
	subscription, err := feed.SubscriptionFor(ctx, uc.reader, userID, catalogue.ChannelInApp)
	if err != nil {
		return Session{}, err
	}

	unread, err := feed.Unread(ctx, uc.reader, userID, organizationID, subscription)
	if err != nil {
		return Session{}, err
	}

	return Session{Subscription: subscription, UnreadCount: unread}, nil
}
