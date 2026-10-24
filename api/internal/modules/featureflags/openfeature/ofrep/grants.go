package ofrep

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/evaluator"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/flaggrants"
)

// FlagGrants is the subject's flag grants by flag, the latest redemption
// first (§7.4 rule 6), read once for a whole evaluation request, bulk
// included. None without a subject; a failed read is logged and grants
// nothing, so the flags answer as their rules say.
func FlagGrants(ctx context.Context, grants flaggrants.Port, orgID uuid.UUID, subject Subject) map[uuid.UUID][]evaluator.FlagGrant {
	if grants == nil || !subject.Known {
		return nil
	}
	rows, err := grants.ForInstance(ctx, orgID, subject.InstanceID)
	if err != nil {
		slog.WarnContext(ctx, "ofrep: flag grants lookup failed", "instance_id", subject.InstanceID, "error", err)
		return nil
	}
	byFlag := make(map[uuid.UUID][]evaluator.FlagGrant, len(rows))
	for _, row := range rows {
		byFlag[row.FlagID] = append(byFlag[row.FlagID], evaluator.FlagGrant{
			Variant: row.Variant, VoucherID: row.VoucherID, RedemptionID: row.RedemptionID,
		})
	}
	return byFlag
}
