// Package listforinstance is the audittrail module's public read port for
// an instance-scoped audit trail page, consumed by instances/getaudittrails
// (REST) and instances/graphql (GraphQL) instead of either reaching into
// this module's own generated db package directly.
package listforinstance

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

type UseCase struct {
	queries *db.Queries
}

func NewUseCase(queries *db.Queries) *UseCase {
	return &UseCase{queries: queries}
}

// Execute returns at most limitPlusOne rows (the caller is expected to pass
// its page limit + 1, so it can detect whether a further page exists
// without a separate COUNT query), ordered by occurred_at DESC, id DESC.
// When cursor is non-nil, only rows strictly after (in that same order) the
// cursor's (OccurredAt, ID) are returned.
func (uc *UseCase) Execute(ctx context.Context, instanceSlug string, orgID uuid.UUID,
	eventName *string, after, before *time.Time, limitPlusOne int32, cursor *pagination.CreatedAtCursor,
) ([]*schema.Entry, error) {
	var cursorOccurredAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorOccurredAt = &cursor.CreatedAt
		cursorID = &cursor.ID
	}

	rows, err := uc.queries.ListAuditTrails(ctx, db.ListAuditTrailsParams{
		OrganizationID:   orgID,
		InstanceSlug:     instanceSlug,
		EventName:        eventName,
		AfterTs:          pgtime.TimePtrToPgTimestamptz(after),
		BeforeTs:         pgtime.TimePtrToPgTimestamptz(before),
		CursorOccurredAt: pgtime.TimePtrToPgTimestamptz(cursorOccurredAt),
		CursorID:         cursorID,
		LimitPlusOne:     limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	result := make([]*schema.Entry, 0, len(rows))
	for _, row := range rows {
		var instanceID *uuid.UUID
		if row.InstanceID != nil {
			id := *row.InstanceID
			instanceID = &id
		}
		result = append(result, &schema.Entry{
			ID:           row.ID,
			InstanceID:   instanceID,
			InstanceSlug: row.InstanceSlug,
			EventName:    row.EventName,
			EventType:    row.EventType,
			OccurredAt:   row.OccurredAt.Time,
			Payload:      row.Payload,
		})
	}
	return result, nil
}
