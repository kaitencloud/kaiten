// Package inbox provides the incoming-side counterpart to
// internal/infrastructure/outbox: a record that a given message from a
// given source has already been processed, so a consumer facing
// at-least-once delivery (e.g. a Dapr pub/sub subscriber redelivering after
// a transient error) can recognise a duplicate and skip reprocessing it
// instead of, for example, writing a second row for the same domain event.
package inbox

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/inbox/db"
)

// Inbox identifies one incoming message, as processed by one named consumer, to
// be checked/recorded against the inbox_events dedup key.
type Inbox struct {
	OrganizationID uuid.UUID // Required: organization identifier
	Source         string    // Required: incoming event source/pipeline (e.g. "debezium:outbox_events")
	MessageID      string    // Required: source-scoped dedup key (e.g. the source's own event id)
	// Consumer is the stable name of the handler that processed the message.
	// Required, and required to be stable across restarts and deployments: it is
	// half of a persisted key, so a name derived from anything ephemeral -- a
	// pointer, a generated id, a registration index -- would make every
	// already-processed message look unprocessed the next time the process starts.
	Consumer string
}

// NewInboxMessage builds an Inbox record for the given organization, source,
// message id and consumer.
func NewInboxMessage(organizationID uuid.UUID, source, messageID, consumer string) Inbox {
	return Inbox{
		OrganizationID: organizationID,
		Source:         source,
		MessageID:      messageID,
		Consumer:       consumer,
	}
}

// Repository defines the interface for recording inbox message processing.
type Repository interface {
	// MarkProcessed atomically records that message has been processed.
	// It returns true if this call is the first to record it - the caller
	// should proceed with processing - or false if it was already recorded,
	// meaning this is a duplicate delivery the caller should skip.
	MarkProcessed(ctx context.Context, message Inbox) (bool, error)
}

// inboxRepository implements Repository.
type inboxRepository struct {
	queries *db.Queries
}

// NewInboxRepository creates a new inbox repository.
func NewInboxRepository(queries *db.Queries) Repository {
	return &inboxRepository{
		queries: queries,
	}
}

// MarkProcessed records message in inbox_events. A duplicate
// (organization_id, source, message_id, consumer) is not an error: it's the
// expected outcome of an at-least-once redelivery, surfaced to the caller as
// (false, nil) rather than propagated as pgx.ErrNoRows.
func (r *inboxRepository) MarkProcessed(ctx context.Context, message Inbox) (bool, error) {
	_, err := r.queries.MarkInboxEventProcessed(ctx, db.MarkInboxEventProcessedParams{
		OrganizationID: message.OrganizationID,
		Source:         message.Source,
		MessageID:      message.MessageID,
		Consumer:       message.Consumer,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}

	return true, nil
}
