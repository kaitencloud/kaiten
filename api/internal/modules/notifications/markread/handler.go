// Package markread turns notifications read, one page or all of them.
package markread

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/feed"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// MaxIDs bounds one call. The client marks a page at a time, and an unbounded
// array is an unbounded query parameter.
const MaxIDs = 200

type UseCase struct {
	uof     *uow.UnitOfWork
	queries func(uow.DBTX) *db.Queries
	reader  feed.Reader
}

func NewUseCase(uof *uow.UnitOfWork, queries func(uow.DBTX) *db.Queries, reader feed.Reader) *UseCase {
	return &UseCase{uof: uof, queries: queries, reader: reader}
}

type Command struct {
	IDs []uuid.UUID
	All bool
}

func (uc *UseCase) Execute(
	ctx context.Context, userID, organizationID uuid.UUID, command Command,
) (schema.MarkReadResult, error) {
	if !command.All && len(command.IDs) == 0 {
		return schema.MarkReadResult{}, kaitenerrors.Validation("Notifications.NothingToMark",
			"pass ids, or all: true")
	}

	if len(command.IDs) > MaxIDs {
		return schema.MarkReadResult{}, kaitenerrors.Validation("Notifications.TooManyIDs",
			"mark at most 200 notifications per call")
	}

	var updated int64

	err := uc.uof.Transact(ctx, func(ctx context.Context) error {
		queries := uc.queries(uc.uof.DBTX(ctx))

		if command.All {
			// The watermark is taken now rather than from the newest row the
			// client has seen: "read everything" is about the moment the person
			// clicked, and a row that arrives mid-request should stay unread.
			readAllBefore := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}

			if err := queries.MarkAllNotificationsRead(ctx, db.MarkAllNotificationsReadParams{
				UserID: userID, ReadAllBefore: readAllBefore,
			}); err != nil {
				return err
			}

			// Individual marks below the watermark say nothing the watermark does
			// not. Deleting them here is what keeps notification_read sparse.
			return queries.CompactNotificationReads(ctx, db.CompactNotificationReadsParams{
				UserID: userID, ReadAllBefore: readAllBefore,
			})
		}

		rows, err := queries.MarkNotificationsRead(ctx, db.MarkNotificationsReadParams{
			UserID: userID, OrganizationID: organizationID, Ids: command.IDs,
		})
		if err != nil {
			return err
		}
		updated = rows

		return nil
	})
	if err != nil {
		return schema.MarkReadResult{}, err
	}

	subscription, err := feed.SubscriptionFor(ctx, uc.reader, userID, catalogue.ChannelInApp)
	if err != nil {
		return schema.MarkReadResult{}, err
	}

	unread, err := feed.Unread(ctx, uc.reader, userID, organizationID, subscription)
	if err != nil {
		return schema.MarkReadResult{}, err
	}

	return schema.MarkReadResult{Updated: int(updated), UnreadCount: unread}, nil
}
