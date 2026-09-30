package outbox

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
)

// tracerName is the instrumentation scope for the publish spans below. They
// are the producer half of the causal chain the audit trail consumer joins:
// the traceparent written into the headers column points at them.
const tracerName = "kaiten.outbox"

type Outbox struct {
	OrganizationID uuid.UUID // Required: organization identifier
	EventName      string    // Required: event name (e.g., "DEPLOYMENT", "INSTANCE_CREATION")
	Data           any       // Required: event payload (any type - will be marshaled to JSON)
	EventType      string    // Required: CloudEvents type (e.g., "com.kaiten.customer.v1.created") - no default, "" is stored as-is
	Headers        any       // Optional: additional headers - will be marshaled to JSON
}

func NewOutboxMessage(organizationID uuid.UUID, eventName, eventType string, payload any, headers any) Outbox {
	return Outbox{
		OrganizationID: organizationID,
		EventName:      eventName,
		EventType:      eventType,
		Data:           payload,
		Headers:        headers,
	}
}

// Repository defines the interface for publishing events to the outbox.
type Repository interface {
	CreateOutboxEvent(ctx context.Context, event Outbox) error
	// CreateOutboxEvents publishes many events in a single round trip (via
	// COPY), for callers that can legitimately emit an unbounded number of
	// events in one transaction -- e.g. the periodic-usage rollover,
	// which materializes one event per skipped window.
	CreateOutboxEvents(ctx context.Context, events []Outbox) error
}

// outboxRepository implements OutboxRepository
type outboxRepository struct {
	queries *db.Queries
}

// NewOutboxRepository creates a new outbox repository
func NewOutboxRepository(queries *db.Queries) Repository {
	return &outboxRepository{
		queries: queries,
	}
}

// CreateOutboxEvent publishes an event to the outbox table.
//
// The span is started before the headers are marshalled on purpose: it is the
// span the traceparent in those headers names, so the consumer that picks the
// event up off the CDC stream becomes its child.
func (r *outboxRepository) CreateOutboxEvent(ctx context.Context, event Outbox) error {
	ctx, span := otel.Tracer(tracerName).Start(
		ctx, "outbox.publish",
		trace.WithSpanKind(trace.SpanKindProducer),
		trace.WithAttributes(
			attribute.String("event.name", event.EventName),
			attribute.String("event.type", event.EventType),
			attribute.String("organization.id", event.OrganizationID.String()),
		),
	)
	defer span.End()

	data, err := json.Marshal(event.Data)
	if err != nil {
		span.RecordError(err)
		return err
	}

	headersJSON, err := marshalHeaders(ctx, event.Headers)
	if err != nil {
		span.RecordError(err)
		return err
	}

	if err := r.queries.CreateOutboxEvent(ctx, db.CreateOutboxEventParams{
		OrganizationID: event.OrganizationID,
		EventName:      event.EventName,
		EventType:      event.EventType,
		Data:           data,
		Headers:        headersJSON,
	}); err != nil {
		span.RecordError(err)
		return err
	}

	return nil
}

// CreateOutboxEvents publishes many events in a single COPY round trip.
func (r *outboxRepository) CreateOutboxEvents(ctx context.Context, events []Outbox) error {
	if len(events) == 0 {
		return nil
	}

	ctx, span := otel.Tracer(tracerName).Start(
		ctx, "outbox.publish_batch",
		trace.WithSpanKind(trace.SpanKindProducer),
		trace.WithAttributes(
			attribute.Int("event.count", len(events)),
			attribute.String("organization.id", events[0].OrganizationID.String()),
		),
	)
	defer span.End()

	params := make([]db.CreateOutboxEventsParams, len(events))
	for i, event := range events {
		data, err := json.Marshal(event.Data)
		if err != nil {
			span.RecordError(err)
			return err
		}

		headersJSON, err := marshalHeaders(ctx, event.Headers)
		if err != nil {
			span.RecordError(err)
			return err
		}

		params[i] = db.CreateOutboxEventsParams{
			OrganizationID: event.OrganizationID,
			EventName:      event.EventName,
			EventType:      event.EventType,
			Data:           data,
			Headers:        headersJSON,
		}
	}

	if _, err := r.queries.CreateOutboxEvents(ctx, params); err != nil {
		span.RecordError(err)
		return err
	}

	return nil
}

// ScopedRepository is a Repository bound to a *uow.UnitOfWork instead of a
// fixed DBTX. Build it once (e.g. in NewUseCase) and call
// CreateOutboxEvent(ctx, ...) directly, inside or outside a Transact
// closure: each call resolves the DBTX active for ctx, so it joins
// whatever transaction Transact opened for that ctx, with no
// outboxdb.New(...) at the call site.
type ScopedRepository struct {
	uof *uow.UnitOfWork
}

// NewScopedRepository builds a ScopedRepository bound to uof. This is the
// constructor modules should use in NewUseCase instead of rebuilding a
// Repository from db.New(uof.DBTX(ctx)) inside every Transact closure.
func NewScopedRepository(uof *uow.UnitOfWork) *ScopedRepository {
	return &ScopedRepository{uof: uof}
}

// repo resolves the Repository bound to whatever DBTX is active for ctx.
func (r *ScopedRepository) repo(ctx context.Context) Repository {
	return NewOutboxRepository(db.New(r.uof.DBTX(ctx)))
}

func (r *ScopedRepository) CreateOutboxEvent(ctx context.Context, event Outbox) error {
	return r.repo(ctx).CreateOutboxEvent(ctx, event)
}

func (r *ScopedRepository) CreateOutboxEvents(ctx context.Context, events []Outbox) error {
	return r.repo(ctx).CreateOutboxEvents(ctx, events)
}
