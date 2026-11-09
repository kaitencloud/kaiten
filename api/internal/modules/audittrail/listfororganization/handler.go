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
// changesOnly leaves out the reads, evaluations and reports that make up the
// bulk of a busy trail, so a page of recent changes is not emptied by them.
func (uc *UseCase) Execute(ctx context.Context, orgID uuid.UUID,
	eventName *string, changesOnly bool, after, before *time.Time, limitPlusOne int32, cursor *pagination.CreatedAtCursor,
) ([]*schema.OrganizationEntry, error) {
	var cursorOccurredAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorOccurredAt = &cursor.CreatedAt
		cursorID = &cursor.ID
	}

	rows, err := uc.page(ctx, changesOnly, db.ListOrganizationAuditTrailsParams{
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
			Actor:        schema.ActorOf(row.ActorID, row.ActorName, row.ActorType, row.ActorExternalID),
		})
	}
	return result, nil
}

// page reads one page through the query that serves it: the two select the same
// columns and take the same parameters, and differ only in the filter
// idx_audit_trail_changes is built for.
func (uc *UseCase) page(ctx context.Context, changesOnly bool, params db.ListOrganizationAuditTrailsParams,
) ([]db.ListOrganizationAuditTrailsRow, error) {
	if !changesOnly {
		return uc.queries.ListOrganizationAuditTrails(ctx, params)
	}
	changes, err := uc.queries.ListOrganizationChanges(ctx, db.ListOrganizationChangesParams(params))
	if err != nil {
		return nil, err
	}
	rows := make([]db.ListOrganizationAuditTrailsRow, len(changes))
	for i, change := range changes {
		rows[i] = db.ListOrganizationAuditTrailsRow(change)
	}
	return rows, nil
}
