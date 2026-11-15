package reportentitlementusagemetric

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
)

func (h *UseCase) ordinaryAttempt(ctx context.Context, organizationID uuid.UUID, slug string) (bool, error) {
	kind, err := h.targetClassifier.EntitlementType(ctx, organizationID, slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return true, nil
	}
	if err != nil {
		return false, err
	} // unknown type must not be guessed ordinary
	// A numeric report on a pool is accepted while off; it only stays out of
	// the ordinary attempt counter.
	return kind != "NUMBER_AI_CREDIT", nil
}

func (h *UseCase) finishOrdinaryAttempt(organizationID uuid.UUID) {
	h.deps.UsageReporter.TrackAsync(organizationID, dogfooding.EntitlementValuesReportedEntitlementSlug)
}
