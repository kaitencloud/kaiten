package reportentitlementusagemetric

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func (h *UseCase) ordinaryAttempt(ctx context.Context, organizationID uuid.UUID, slug string) (bool, error) {
	kind, err := h.targetClassifier.EntitlementType(ctx, organizationID, slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return true, nil
	}
	if err != nil {
		return false, err
	} // unknown type must not be guessed ordinary
	if err := h.deps.AIPolicy.RequireType(ctx, kind); err != nil {
		return false, err
	}
	return true, nil
}

func (h *UseCase) finishOrdinaryAttempt(organizationID uuid.UUID, outcome error) {
	// The mandatory post-LockPair check remains authoritative if a target changed
	// between the early query and the transaction. An AI refusal still counts 0.
	if apierrors.GetCode(outcome) == "AIUsage.Disabled" {
		return
	}
	h.deps.UsageReporter.TrackAsync(organizationID, dogfooding.EntitlementValuesReportedEntitlementSlug)
}
