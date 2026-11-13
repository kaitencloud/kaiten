package reportentitlementusagemetric

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

func numericOrEmpty(d *decimal.Decimal) pgtype.Numeric {
	if d == nil {
		return pgtype.Numeric{}
	}
	return numeric(*d)
}

func timestampOrEmpty(t *time.Time) pgtype.Timestamp {
	if t == nil {
		return pgtype.Timestamp{}
	}
	return timestamp(*t)
}

func (h *UseCase) applyAI(ctx context.Context, eff *Effect) error {
	if eff.AIRow == nil {
		return nil
	}
	row := eff.AIRow
	q := h.queryRepo.q(ctx)
	var err error
	if eff.AIUpdate {
		var affected int64
		affected, err = q.CommitAIOperation(ctx, db.CommitAIOperationParams{ID: row.ID, OrganizationID: row.OrganizationID, Status: row.Status, CommittedAt: row.CommittedAt, ModelRef: row.ModelRef, ModelID: row.ModelID, RequestType: row.RequestType, RequestStatus: row.RequestStatus, InputTokens: row.InputTokens, CacheReadInputTokens: row.CacheReadInputTokens, CacheWriteInputTokens: row.CacheWriteInputTokens, OutputTokens: row.OutputTokens, Units: row.Units, UnitType: row.UnitType, DurationMs: row.DurationMs, CreditConversionRuleID: row.CreditConversionRuleID, Authorized: row.Authorized, DenialReason: row.DenialReason, CreditsComputed: row.CreditsComputed, CreditsCharged: row.CreditsCharged, ValueBefore: row.ValueBefore, ValueAfter: row.ValueAfter, WindowStart: row.WindowStart, CommitHash: row.CommitHash})
		if err == nil && affected != 1 {
			return fmt.Errorf("AI operation was already settled or disappeared")
		}
	} else {
		err = q.InsertAIOperation(ctx, db.InsertAIOperationParams{ID: row.ID, OrganizationID: row.OrganizationID, InstanceID: row.InstanceID, EntitlementID: row.EntitlementID, TransactionID: row.TransactionID, Status: row.Status, ReportedAt: row.ReportedAt, CommittedAt: row.CommittedAt, ExpiresAt: row.ExpiresAt, ModelRef: row.ModelRef, ModelID: row.ModelID, RequestType: row.RequestType, RequestStatus: row.RequestStatus, InputTokens: row.InputTokens, CacheReadInputTokens: row.CacheReadInputTokens, CacheWriteInputTokens: row.CacheWriteInputTokens, OutputTokens: row.OutputTokens, Units: row.Units, UnitType: row.UnitType, DurationMs: row.DurationMs, CreditConversionRuleID: row.CreditConversionRuleID, Authorized: row.Authorized, DenialReason: row.DenialReason, CreditsReserved: row.CreditsReserved, CreditsComputed: row.CreditsComputed, CreditsCharged: row.CreditsCharged, ValueBefore: row.ValueBefore, ValueAfter: row.ValueAfter, WindowStart: row.WindowStart, RequestHash: row.RequestHash, CommitHash: row.CommitHash})
	}
	if err != nil {
		return err
	}
	body, err := json.Marshal(eff.Response)
	if err != nil {
		return err
	}
	affected, err := q.StoreAIPhaseResponse(ctx, db.StoreAIPhaseResponseParams{ID: row.ID, OrganizationID: row.OrganizationID, Phase: eff.AIPhase, Response: body})
	if err == nil && affected != 1 {
		return fmt.Errorf("AI phase response already exists or operation disappeared")
	}
	return err
}
