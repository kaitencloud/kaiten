package listnotifications

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/feed"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/schema"
)

type UseCase struct {
	reader feed.Reader
}

func NewUseCase(reader feed.Reader) *UseCase {
	return &UseCase{reader: reader}
}

type Query struct {
	UnreadOnly bool
	// Objects narrows the feed to notifications about these kinds of object;
	// empty means every kind.
	Objects []catalogue.Object
	Limit   int32
	Cursor  string
}

func (uc *UseCase) Execute(
	ctx context.Context, userID, organizationID uuid.UUID, query Query,
) (schema.List, error) {
	subscription, err := feed.SubscriptionFor(ctx, uc.reader, userID, catalogue.ChannelInApp)
	if err != nil {
		return schema.List{}, err
	}

	// Narrowing the subscription, not filtering the page: the query then only
	// ever reads matching rows, so paging and the unread count that comes with the
	// page agree with the filter.
	return feed.List(ctx, uc.reader, feed.Query{
		UserID:         userID,
		OrganizationID: organizationID,
		Subscription:   subscription.About(query.Objects),
		UnreadOnly:     query.UnreadOnly,
		Limit:          query.Limit,
		Cursor:         query.Cursor,
	})
}
