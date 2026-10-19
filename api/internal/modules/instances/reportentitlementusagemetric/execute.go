package reportentitlementusagemetric

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

func (h *UseCase) executeReport(ctx context.Context, instanceSlug, entitlementSlug string, command *Command) (result *Result, resultErr error) {
	if command.AI != nil {
		if err := validateAI(command, h.deps.ReservationMaxTTL); err != nil {
			return nil, err
		}
	}
	defer func() {
		if result == nil {
			recordAIReport(ctx, command, nil, resultErr)
		} else {
			recordAIReport(ctx, command, result.Usage, resultErr)
		}
	}()
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.EntitlementValuesReportedEntitlementSlug)
	properties, tooLarge, err := encodeMetadata(command.Metadata)
	if err != nil {
		return nil, err
	}
	started := time.Now()
	outcome := "accepted"
	defer func() {
		if resultErr != nil && outcome == "accepted" {
			outcome = "error"
		}
		if h.duration != nil {
			h.duration.Record(ctx, time.Since(started).Seconds(), metric.WithAttributes(attribute.String("outcome", outcome)))
		}
	}()
	var eff *Effect
	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		st, err := h.load(ctx, user.OrganizationID, instanceSlug, entitlementSlug)
		if err != nil {
			if errors.Is(err, usage.ErrRolloverLimitExceeded) {
				h.rolloverCapExceeded.Add(ctx, 1)
				return kaitenerrors.Internal("ReportEntitlementUsageMetric.RolloverLimitExceeded", fmt.Sprintf("closing usage windows exceeds the limit of %d", h.maxRolloverClosures))
			}
			return err
		}
		st.Properties = properties
		st.TransactionID = command.TransactionID
		if err := h.loadAI(ctx, st, command, instanceSlug); err != nil {
			return err
		}
		if st.Replay != nil {
			outcome = "replayed"
			h.idempotentReplays.Add(ctx, 1)
			result = &Result{Usage: st.Replay, Replayed: true}
			return nil
		}
		if command.AI == nil && command.TransactionID != nil {
			original, err := h.queryRepo.FindReportByTransactionID(ctx, user.OrganizationID, st.Pair.InstanceID, st.Pair.EntitlementID, *command.TransactionID, command.Value, st.Now.Add(-h.idempotencyWindow), st.Now.Add(idempotencyLookahead))
			if err != nil {
				return err
			}
			if original != nil {
				if original.Behavior != command.Behavior || !original.SameValue {
					outcome = "conflict"
					h.idempotencyConflict.Add(ctx, 1)
					return kaitenerrors.ConflictWithErrors("ReportEntitlementUsageMetric.TransactionIdReused", "transactionId already used for another report; send a correction under a new key", &kaitenerrors.ErrorDetail{Message: "the report this transactionId was first accepted with", Location: idempotencyKeyLocation, Value: map[string]any{"reportSeq": original.ReportSeq, "reportedAt": original.ReportedAt, "behavior": original.Behavior, "value": original.ReportedValue}})
				}
				outcome = "replayed"
				h.idempotentReplays.Add(ctx, 1)
				result = &Result{Usage: original.response(st.Pair.EntitlementID, st.Pair.EntitlementSlug), Replayed: true}
				return nil
			}
		}
		if command.AI == nil {
			if err := h.queryRepo.LoadLimits(ctx, st.Pair, instanceSlug, entitlementSlug, user.OrganizationID); err != nil {
				return err
			}
		}
		if err := h.resolveState(ctx, st); err != nil {
			if errors.Is(err, usage.ErrRolloverLimitExceeded) {
				h.rolloverCapExceeded.Add(ctx, 1)
				return kaitenerrors.Internal("ReportEntitlementUsageMetric.RolloverLimitExceeded", fmt.Sprintf("closing usage windows exceeds the limit of %d", h.maxRolloverClosures))
			}
			return err
		}
		eff, err = kindFor(command).plan(st, command)
		if err != nil {
			return err
		}
		return h.apply(ctx, st, eff)
	})
	if err != nil {
		return nil, err
	}
	if result != nil {
		return result, nil
	}
	if eff.Refusal != nil {
		outcome = "rejected"
		return nil, eff.Refusal
	}
	result = &Result{Usage: eff.Response}
	if tooLarge {
		h.metadataDropped.Add(ctx, 1, metric.WithAttributes(attribute.String("reason", metadataDroppedTooLarge)))
		result.MetadataDropped = metadataDroppedTooLarge
	}
	return result, nil
}
