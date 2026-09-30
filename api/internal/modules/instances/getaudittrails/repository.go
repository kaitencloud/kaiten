package getaudittrails

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/listforinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

type Repository interface {
	// List returns at most limitPlusOne rows (the caller is expected to
	// pass its page limit + 1, so it can detect whether a further page
	// exists without a separate COUNT query), ordered by occurred_at DESC,
	// id DESC. When cursor is non-nil, only rows strictly after (in that
	// same order) the cursor's (CreatedAt, ID) are returned.
	List(ctx context.Context, instanceSlug string, orgID uuid.UUID,
		eventName *string, after, before *time.Time, limitPlusOne int32, cursor *pagination.CreatedAtCursor) ([]*schema.AuditTrail, error)
}

// QueryRepository adapts the audittrail module's public read port
// (listforinstance) into this module's own AuditTrail schema type, rather
// than reaching into audittrail's generated db package directly.
type QueryRepository struct {
	port *listforinstance.UseCase
}

func NewQueryRepository(port *listforinstance.UseCase) *QueryRepository {
	return &QueryRepository{port: port}
}

func (r *QueryRepository) List(ctx context.Context, instanceSlug string, orgID uuid.UUID,
	eventName *string, after, before *time.Time, limitPlusOne int32, cursor *pagination.CreatedAtCursor,
) ([]*schema.AuditTrail, error) {
	entries, err := r.port.Execute(ctx, instanceSlug, orgID, eventName, after, before, limitPlusOne, cursor)
	if err != nil {
		return nil, err
	}

	result := make([]*schema.AuditTrail, 0, len(entries))
	for _, entry := range entries {
		var payload any
		if len(entry.Payload) > 0 {
			if err := json.Unmarshal(entry.Payload, &payload); err != nil {
				return nil, err
			}
		}
		result = append(result, &schema.AuditTrail{
			ID:           entry.ID,
			InstanceID:   entry.InstanceID,
			InstanceSlug: entry.InstanceSlug,
			EventName:    entry.EventName,
			EventType:    entry.EventType,
			Timestamp:    entry.OccurredAt,
			Payload:      payload,
		})
	}
	return result, nil
}
