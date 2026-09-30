package cdc

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/inbox"
	inboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/inbox/db"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/pkg/debezium"
)

// Source is the pipeline every consumer here reads from, and the `source` column
// of every row they write.
//
// One value for all of them, deliberately. Source answers "which stream did this
// message arrive on" and consumer answers "who processed it"; before those were two
// columns, a second consumer had to invent a source of its own to get a row, which
// left the column describing neither thing accurately.
const Source = "debezium:outbox_events"

const tracerName = "kaiten-api"

// ErrNoConsumers is returned by NewDispatcher when it is given nothing to dispatch
// to. A dispatcher with no consumers answers Success to every delivery, which is
// indistinguishable from working and would silently discard the CDC stream.
var ErrNoConsumers = errors.New("cdc: a dispatcher needs at least one consumer")

// Dispatcher fans one CDC delivery out to every registered consumer -- in parallel,
// each with its own transaction and its own inbox mark -- and answers the delivery
// only once all of them have finished.
type Dispatcher struct {
	uof       *uow.UnitOfWork
	consumers []Consumer
}

// NewDispatcher builds the fan-out.
//
// It validates the consumer names rather than trusting them, because both failure
// modes are silent and permanent: an empty name writes rows under "" that no
// consumer can later claim, and two consumers sharing a name share one inbox row --
// so whichever runs first tells the other its work was already done, forever. Both
// are wiring mistakes, so they are refused at construction, where the composition
// root can fail the process, rather than at the first delivery.
func NewDispatcher(uof *uow.UnitOfWork, consumers ...Consumer) (*Dispatcher, error) {
	if len(consumers) == 0 {
		return nil, ErrNoConsumers
	}

	seen := make(map[string]bool, len(consumers))
	for i, consumer := range consumers {
		name := consumer.Name()
		if name == "" {
			return nil, fmt.Errorf("cdc: consumer at index %d has an empty name, "+
				"which is half of its inbox key", i)
		}
		if seen[name] {
			return nil, fmt.Errorf("cdc: two consumers are named %q, so they would share "+
				"one inbox row and each would see the other's work as its own", name)
		}
		seen[name] = true
	}

	return &Dispatcher{uof: uof, consumers: consumers}, nil
}

// Handle runs every consumer that wants event in parallel and, once all of them have
// finished, reports what should become of the delivery.
//
// Concurrency costs this nothing in guarantees, because the consumers were already
// independent: each has its own transaction, so none can see another's writes or
// depend on another's order, and one failing neither stops the others nor undoes what
// they committed. What it buys is that a delivery costs the slowest consumer instead
// of the sum of all of them -- which matters here, where a consumer's work is an HTTP
// round trip to a third party rather than a query.
//
// Handle returns only when every consumer it started has finished. The delivery has
// one acknowledgement and it is this function's answer, so reporting it while a
// consumer is still running would acknowledge work that has not happened yet -- and
// the process could then be shut down mid-flight with the broker already told the
// message was handled.
//
// The delivery is a Retry if any consumer failed, which is the only aggregation that
// is safe in both directions -- answering Success while one consumer still owes the
// message would lose that work, and there is no way to acknowledge a delivery
// partially.
//
// One precondition, and the reason it holds: ctx must not already be inside a
// uow.Transact call, or every consumer would join that one transaction and they would
// be using a single pgx.Tx from several goroutines at once. Handle is the top of its
// own call stack by construction -- a transport hands it a delivery, it is never
// composed into somebody else's write.
func (d *Dispatcher) Handle(ctx context.Context, organizationID uuid.UUID, event debezium.Event) Decision {
	// Indexed by consumer rather than appended to under a mutex: the goroutines
	// finish in whatever order they finish, and the failures are read back below in
	// registration order, so what an operator reads is the same on every run.
	failures := make([]error, len(d.consumers))

	var running sync.WaitGroup
	for i, consumer := range d.consumers {
		if !consumer.Wants(event) {
			continue
		}

		running.Go(func() {
			failures[i] = d.consume(ctx, organizationID, consumer, event)
		})
	}
	running.Wait()

	decision := Success
	for i, err := range failures {
		if err == nil {
			continue
		}

		// Logged per consumer rather than once at the end: which handler failed is
		// the first thing anyone reading this needs, and the delivery's own outcome
		// says nothing about who caused it.
		slog.ErrorContext(ctx, "CDC consumer failed, asking for redelivery",
			slog.String("consumer", d.consumers[i].Name()),
			slog.String("event_id", event.ID),
			slog.String("event_type", event.EventType),
			slog.String("error", err.Error()))
		decision = Retry
	}

	return decision
}

// consume runs one consumer against one event, inside the transaction that records
// it as consumed.
//
// The order inside the transaction is the load-bearing part, and it is the audit
// trail subscriber's, kept: mark FIRST, because that is what makes the dedup key
// race-free against a concurrent redelivery, and then let a failure of the work roll
// the mark back with it. Marking afterwards would be the opposite trade -- race-free
// against nothing, and a crash between the work and the mark would replay the work.
func (d *Dispatcher) consume(
	ctx context.Context, organizationID uuid.UUID, consumer Consumer, event debezium.Event,
) (err error) {
	ctx, span := otel.Tracer(tracerName).Start(
		ctx, "cdc.consume",
		trace.WithSpanKind(trace.SpanKindConsumer),
		trace.WithAttributes(
			attribute.String("cdc.consumer", consumer.Name()),
			attribute.String("event.id", event.ID),
			attribute.String("event.type", event.EventType),
			attribute.String("organization.id", organizationID.String()),
		),
	)
	defer span.End()

	// A consumer runs on its own goroutine, so a panic in one does not unwind into
	// a handler that could recover it -- unrecovered it would take the process down
	// and every delivery in flight with it. Turned back into this consumer's own
	// error instead. Transact's deferred rollback has already taken the inbox mark
	// down with the work by now, so a panicking consumer is retried like a failing
	// one.
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("cdc: consumer %s panicked: %v", consumer.Name(), recovered)
			span.RecordError(err)
			span.SetStatus(codes.Error, "consumer panicked")
		}
	}()

	var consumed bool
	err = d.uof.Transact(ctx, func(ctx context.Context) error {
		repo := inbox.NewInboxRepository(inboxdb.New(d.uof.DBTX(ctx)))

		firstDelivery, err := repo.MarkProcessed(
			ctx, inbox.NewInboxMessage(organizationID, Source, event.ID, consumer.Name()))
		if err != nil {
			return err
		}
		if !firstDelivery {
			return nil
		}

		if err := consumer.Consume(ctx, event); err != nil {
			return err
		}

		consumed = true
		return nil
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "consumer failed")
		return err
	}

	// Recorded on the span rather than only in a log line, and set after the commit:
	// until then nothing is durable, so a consumer that rolled back must not read as
	// one that skipped a duplicate.
	span.SetAttributes(attribute.Bool("cdc.consumed", consumed))
	return nil
}
