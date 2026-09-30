package cdc

import (
	"context"

	"github.com/kaitencloud/kaiten/api/pkg/debezium"
)

// Consumer is one in-process reader of the CDC stream.
//
// Three methods, because a consumer answers three separate questions and conflating
// them is what makes a fan-out untestable: who am I in the inbox, does this message
// concern me, and what do I do about it.
type Consumer interface {
	// Name is this consumer's identity in the inbox_events dedup key.
	//
	// It must be a stable constant -- half of a persisted key lives across restarts,
	// redeployments and rollbacks, so a name derived from a pointer, a generated id
	// or a position in a slice would make every already-processed message look
	// unprocessed the next time the process starts. Renaming one is a data
	// migration, not a refactor.
	//
	// It must also be unique among the consumers registered together; NewDispatcher
	// refuses a duplicate rather than letting two handlers quietly share one row.
	Name() string

	// Wants reports whether this consumer processes event.
	//
	// A consumer that answers false records nothing at all. That is deliberate:
	// writing a mark for work that was never in scope would grow the table by
	// consumers x events, and -- worse -- a later widening of the filter would find
	// those messages already marked and skip them for good.
	//
	// It must be a pure function of the event. It runs outside the consumer's
	// transaction and its answer decides whether one is opened.
	Wants(event debezium.Event) bool

	// Consume does the work.
	Consume(ctx context.Context, event debezium.Event) error
}

// Decision is what a delivery is worth to the broker. The three values are Dapr's
// own vocabulary, spelled here because being the thing Dapr delivers to is what this
// package is; how a decision is written back over HTTP belongs to the transport.
type Decision string

const (
	// Success acknowledges the delivery: every consumer that wanted this message has
	// now consumed it, this time or on an earlier delivery.
	Success Decision = "SUCCESS"

	// Retry asks for redelivery. It means at least one consumer still owes this
	// message -- never that nobody processed it, since the consumers that succeeded
	// have committed their marks and will skip themselves next time.
	Retry Decision = "RETRY"

	// Drop discards the delivery permanently, without a dead letter. Reserved for
	// messages no redelivery could fix AND no operator could act on: an envelope
	// that will not parse, or one naming a tenant that no longer exists. Nothing
	// will ever look at them again, so this is never the answer to a failure that
	// might be transient -- that is Retry, which is bounded and lands in
	// DeadLetterTopic rather than in nothing.
	Drop Decision = "DROP"
)

// The Dapr subscription this package is delivered through. These are one fact and
// have to agree, which is why they live together: Route is what the transport
// mounts and what GET /dapr/subscribe advertises, and a disagreement between those
// two is a subscription that exists on paper and receives nothing.
const (
	PubsubName = "rabbitmq-pubsub"
	Topic      = "kaiten.events"
	Route      = "/cdc/events" // relative to the /dapr group

	// DeadLetterTopic is where a delivery goes when Retry has been answered as many
	// times as the retry policy allows.
	//
	// Without it, Retry is a lie. The RabbitMQ component's requeueInFailure defaults
	// to false, so a nacked delivery is discarded by the broker -- one attempt, no
	// redelivery, and the only trace is a log line. A dead-letter topic is what turns
	// "we gave up" into a message somebody can still see, and it is why
	// requeueInFailure stays false: the sidecar publishes here and acknowledges the
	// original, so the delivery leaves the queue exactly once either way.
	//
	// The retry policy itself is not in this package and cannot be -- it is the
	// sidecar that redelivers, so it is configured where the sidecar reads its
	// resources: docker/dapr/resiliency.yaml locally, and the Resiliency this
	// deployment's chart renders in a cluster. Five attempts with exponential
	// backoff, then here.
	DeadLetterTopic = "kaiten.events.dlq"

	// DeadLetterRoute receives DeadLetterTopic. A dead-letter topic nobody
	// subscribes to is a queue that grows without bound and is read by no one, which
	// is the same lost message with a bigger disk bill.
	DeadLetterRoute = "/cdc/dead-letter" // relative to the /dapr group
)
