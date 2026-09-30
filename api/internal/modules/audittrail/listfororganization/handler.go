// Package listfororganization is the audittrail module's public read port
// for an organization-wide audit trail page, consumed by instances/graphql
// (the GraphQL organizationAuditTrails field) instead of reaching into this
// module's own generated db package directly.
package listfororganization

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

// Execute returns at most limitPlusOne rows (see listforinstance.Execute's
// doc comment for the pagination contract, which this shares), ordered by
// occurred_at DESC, id DESC.
func (uc *UseCase) Execute(ctx context.Context, orgID uuid.UUID,
	eventName *string, after, before *time.Time, limitPlusOne int32, cursor *pagination.CreatedAtCursor,
) ([]*schema.OrganizationEntry, error) {
	var cursorOccurredAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorOccurredAt = &cursor.CreatedAt
		cursorID = &cursor.ID
	}

	rows, err := uc.queries.ListOrganizationAuditTrails(ctx, db.ListOrganizationAuditTrailsParams{
		OrganizationID:   orgID,
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

	result := make([]*schema.OrganizationEntry, 0, len(rows))
	for _, row := range rows {
		result = append(result, &schema.OrganizationEntry{
			ID:           row.ID,
			InstanceID:   row.InstanceID,
			InstanceSlug: row.InstanceSlug,
			InstanceName: row.InstanceName,
			CustomerID:   row.CustomerID,
			CustomerSlug: row.CustomerSlug,
			CustomerName: row.CustomerName,
			EventName:    row.EventName,
			EventType:    row.EventType,
			OccurredAt:   row.OccurredAt.Time,
			Payload:      row.Payload,
		})
	}
	return result, nil
}
