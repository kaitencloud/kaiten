package kaiten

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/cdc"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/pkg/debezium"
)

// Events is the surface for messages this deployment delivers to itself.
type Events struct {
	org        *organization.UseCases
	dispatcher *cdc.Dispatcher
}

// Events returns the CDC surface.
func (k *Kaiten) Events() Events {
	return Events{org: k.modules.Organization, dispatcher: k.modules.CDC}
}

// Handle consumes one CDC delivery and reports what should become of it.
func (e Events) Handle(ctx context.Context, payload []byte) cdc.Decision {
	// Acknowledged, not dropped: it is expected traffic, once a minute from every
	// Debezium, and Dapr logs a warning for each Drop it is answered.
	if debezium.IsHeartbeat(payload) {
		return cdc.Success
	}

	event, err := debezium.Parse(payload)
	if err != nil {
		slog.ErrorContext(ctx, "failed to parse CDC event", slog.String("error", err.Error()))
		return cdc.Drop
	}

	// An empty envelope can arrive from CDC on a table CREATE. There is no message
	// here to consume and no id to record having consumed it.
	if event.ID == "" {
		return cdc.Drop
	}

	organizationID, err := uuid.Parse(event.OrganizationID)
	if err != nil || organizationID == uuid.Nil {
		slog.ErrorContext(ctx, "CDC event names no usable organization, dropping",
			slog.String("event_id", event.ID),
			slog.String("organization_id", event.OrganizationID))
		return cdc.Drop
	}

	ctx, decision := e.bindActor(ctx, organizationID, event)
	if ctx == nil {
		return decision
	}

	return e.dispatcher.Handle(outbox.ContextWithTrace(ctx, event.Headers), organizationID, event)
}

// HandleDeadLetter is the end of the line: a delivery the retry policy could not
// get accepted, republished here by the sidecar so that giving up is visible.
//
// It logs and acknowledges, which is the whole of it. The alternative -- answering
// Retry -- would put the message back in the dead-letter queue it just came out of,
// with no policy behind that topic to bound it, and the first symptom would be one
// permanently failing event pinned in a loop.
//
// So this is deliberately lossy: after the warning, the message is gone. A durable
// record is the obvious next step and is not this function -- it would want a table,
// a retention window and something that reads it, and every one of those is a
// decision nobody has made yet. What exists today is a log line loud enough to
// notice, in the place a table would later go.
func (e Events) HandleDeadLetter(ctx context.Context, payload []byte) cdc.Decision {
	// Parsed for the fields that make the warning actionable, not to decide
	// anything: an envelope that failed five deliveries is being dropped either way,
	// and one that will not parse is exactly the case where the raw size and a
	// truncated prefix are all anyone has to go on.
	event, err := debezium.Parse(payload)
	if err != nil {
		slog.WarnContext(ctx, "CDC delivery dead-lettered and discarded, and its envelope does not parse",
			slog.Int("payload_bytes", len(payload)),
			slog.String("payload_prefix", string(payload[:min(len(payload), 256)])),
			slog.String("error", err.Error()))
		return cdc.Success
	}

	slog.WarnContext(ctx, "CDC delivery dead-lettered and discarded after exhausting redelivery",
		slog.String("event_id", event.ID),
		slog.String("event_type", event.EventType),
		slog.String("event_name", event.EventName),
		slog.String("organization_id", event.OrganizationID))
	return cdc.Success
}

// bindActor resolves system:kaiten inside organizationID and returns the context the
// consumers run under, or a nil context and the decision the delivery is worth.
//
// Returning the two together rather than an error keeps the mapping from "what went
// wrong" to "what the broker is told" in one place; a caller that had to re-derive
// the decision from an error would be the second place it could drift.
func (e Events) bindActor(
	ctx context.Context, organizationID uuid.UUID, event debezium.Event,
) (context.Context, cdc.Decision) {
	actorID, err := e.org.SystemActor.SystemActorInOrganization(
		ctx, organizationID, platformidentity.ExternalID)

	switch {
	case errors.Is(err, organization.ErrNoSystemActor):
		return nil, e.classifyMissingActor(ctx, organizationID, event)
	case err != nil:
		slog.ErrorContext(ctx, "could not resolve the system actor for a CDC event",
			slog.String("event_id", event.ID),
			slog.String("organization_id", organizationID.String()),
			slog.String("error", err.Error()))
		return nil, cdc.Retry
	}

	ctx, err = bindSystem(ctx, actorID, organizationID)
	if err != nil {
		slog.ErrorContext(ctx, "could not bind the system principal for a CDC event",
			slog.String("event_id", event.ID),
			slog.String("organization_id", organizationID.String()),
			slog.String("error", err.Error()))
		return nil, cdc.Retry
	}

	return ctx, cdc.Success
}

// classifyMissingActor decides what an absent membership means.
//
// A tenant that is gone takes its membership with it through the cascade, and there
// is nothing left for any consumer to write against -- so the message is discarded.
// A tenant that is present without one is an anomaly the membership trigger exists to
// prevent, so it is retried and logged loudly rather than quietly dropped: the work
// is still owed if somebody repairs the row.
func (e Events) classifyMissingActor(
	ctx context.Context, organizationID uuid.UUID, event debezium.Event,
) cdc.Decision {
	exists, err := e.org.TargetOrganization.OrganizationExists(ctx, organizationID)
	if err != nil {
		slog.ErrorContext(ctx, "could not tell whether a CDC event's organization exists",
			slog.String("event_id", event.ID),
			slog.String("organization_id", organizationID.String()),
			slog.String("error", err.Error()))
		return cdc.Retry
	}

	if !exists {
		slog.InfoContext(ctx, "CDC event names an organization that no longer exists, dropping",
			slog.String("event_id", event.ID),
			slog.String("organization_id", organizationID.String()))
		return cdc.Drop
	}

	slog.ErrorContext(ctx, "organization exists but system:kaiten holds no membership in it",
		slog.String("event_id", event.ID),
		slog.String("organization_id", organizationID.String()))
	return cdc.Retry
}
