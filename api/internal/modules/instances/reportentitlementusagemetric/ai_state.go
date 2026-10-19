package reportentitlementusagemetric

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

var (
	transactionPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)
	unitsPattern       = regexp.MustCompile(`^[0-9]{1,12}(\.[0-9]{1,6})?$`)
)

const (
	DefaultIdempotencyWindow = 840 * time.Hour
	DefaultReservationTTL    = 10 * time.Minute
	DefaultReservationMaxTTL = time.Hour
)

func validateAI(cmd *Command, maxTTL time.Duration) error {
	v := cmd.AI
	invalid := func(message string) error {
		return apierrors.UnprocessableEntity("ReportEntitlementUsageMetric.InvalidAiUsage", message)
	}
	if v.TransactionID == "" {
		return apierrors.UnprocessableEntity("ReportEntitlementUsageMetric.TransactionIdRequired", "transactionId is required")
	}
	if !transactionPattern.MatchString(v.TransactionID) {
		return apierrors.UnprocessableEntity("ReportEntitlementUsageMetric.InvalidTransactionId", "invalid transactionId")
	}
	if cmd.Behavior != "" && cmd.Behavior != BehaviorAppend {
		return apierrors.UnprocessableEntity("ReportEntitlementUsageMetric.AiUsageRequiresAppend", "AI usage requires append")
	}
	if v.Phase != "reserve" && v.Phase != "commit" {
		return invalid("phase must be reserve or commit")
	}
	if v.Model != nil && (len(*v.Model) == 0 || len(*v.Model) > 255 || strings.ContainsRune(*v.Model, 0)) {
		return invalid("invalid model identifier")
	}
	if v.RequestType != nil {
		switch *v.RequestType {
		case aicredit.Completion, aicredit.Embedding, aicredit.ImageGeneration, aicredit.Audio, aicredit.Video:
		default:
			return invalid("invalid requestType")
		}
	}
	if v.Phase == "reserve" {
		if v.Model == nil || v.RequestType == nil || v.RequestStatus != nil {
			return invalid("reserve requires model and requestType, and refuses requestStatus")
		}
		if v.TTLSeconds != nil && (*v.TTLSeconds < 1 || *v.TTLSeconds > int64(maxTTL/time.Second)) {
			return invalid("ttlSeconds is out of range")
		}
	} else {
		if v.RequestStatus == nil || v.TTLSeconds != nil {
			return invalid("commit requires requestStatus and refuses ttlSeconds")
		}
		switch *v.RequestStatus {
		case aicredit.Success, aicredit.ProviderError, aicredit.CustomerError, aicredit.NotSent:
		default:
			return invalid("invalid requestStatus")
		}
	}
	if v.Usage != nil {
		u := v.Usage
		for _, n := range []*int64{u.InputTokens, u.CacheReadInputTokens, u.CacheWriteInputTokens, u.OutputTokens, u.DurationMS} {
			if n != nil && *n < 0 {
				return invalid("usage must be nonnegative")
			}
		}
		if (u.Units == nil) != (u.UnitType == nil) {
			return invalid("units and unitType must be supplied together")
		}
		if u.Units != nil && !unitsPattern.MatchString(*u.Units) {
			return invalid("invalid units")
		}
		if u.UnitType != nil && *u.UnitType != "image" && *u.UnitType != "second" && *u.UnitType != "frame" {
			return invalid("invalid unitType")
		}
	}
	return nil
}

func timestamp(t time.Time) pgtype.Timestamp { return pgtype.Timestamp{Time: t, Valid: true} }
func numeric(d decimal.Decimal) pgtype.Numeric {
	var n pgtype.Numeric
	_ = n.Scan(d.String())
	return n
}

func decimalOf(n pgtype.Numeric) *decimal.Decimal {
	if !n.Valid {
		return nil
	}
	d := decimal.NewFromBigInt(n.Int, n.Exp)
	return &d
}

func (h *UseCase) loadAI(ctx context.Context, st *State, cmd *Command) error {
	q := h.queryRepo.q(ctx)
	st.ReservationTTL = h.deps.ReservationTTL
	if st.Pair.EntitlementType == db.EntitlementTypeNUMBERAICREDIT {
		reserved, err := q.GetAIReserved(ctx, db.GetAIReservedParams{OrganizationID: st.OrganizationID, InstanceID: st.Pair.InstanceID, EntitlementID: st.Pair.EntitlementID, Now: timestamp(st.Now)})
		if err != nil {
			return err
		}
		st.Reserved = *decimalOf(reserved)
	}
	if cmd.AI == nil {
		return nil
	}
	if st.Pair.EntitlementType != db.EntitlementTypeNUMBERAICREDIT || st.AggregationMethod != "SUM" {
		return apierrors.UnprocessableEntity("ReportEntitlementUsageMetric.AiUsageUnsupportedEntitlement", "AI usage requires a SUM credit pool")
	}
	v := cmd.AI
	encoded, err := json.Marshal(v)
	if err != nil {
		return err
	}
	hash := sha256.Sum256(encoded)
	st.AIHash = hash[:]
	op, err := q.GetAIOperation(ctx, db.GetAIOperationParams{OrganizationID: st.OrganizationID, InstanceID: st.Pair.InstanceID, EntitlementID: st.Pair.EntitlementID, TransactionID: v.TransactionID, Since: timestamp(st.Now.Add(-h.deps.IdempotencyWindow))})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err == nil {
		st.Operation = &op
	}
	if st.Operation != nil {
		var previousHash, previousResponse []byte
		if v.Phase == "reserve" {
			if op.Status != db.AiInferenceStatusRESERVED || (op.ExpiresAt.Valid && !op.ExpiresAt.Time.After(st.Now)) {
				return apierrors.Conflict("ReportEntitlementUsageMetric.TransactionIdReused", "operation is already closed or expired")
			}
			previousHash, previousResponse = op.RequestHash, op.ReserveResponse
		} else if op.Status == db.AiInferenceStatusCOMMITTED || op.Status == db.AiInferenceStatusRELEASED {
			if len(op.CommitHash) != 32 || len(op.CommitResponse) == 0 {
				return apierrors.Conflict("ReportEntitlementUsageMetric.TransactionIdReused", "settled operation is missing replay evidence")
			}
			previousHash, previousResponse = op.CommitHash, op.CommitResponse
		}
		if previousHash != nil {
			if string(previousHash) != string(st.AIHash) || len(previousResponse) == 0 {
				return apierrors.Conflict("ReportEntitlementUsageMetric.TransactionIdReused", "transactionId already used with another phase or body")
			}
			var response schema.EntitlementUsage
			if err := json.Unmarshal(previousResponse, &response); err != nil {
				return err
			}
			response.Replayed = true
			st.Replay = &response
			return nil
		}
	}
	modelRef, requestType := "", aicredit.RequestType("")
	if st.Operation != nil {
		modelRef = st.Operation.ModelRef
		requestType = aicredit.RequestType(st.Operation.RequestType)
	}
	if v.Model != nil {
		modelRef = *v.Model
	}
	if v.RequestType != nil {
		requestType = *v.RequestType
	}
	if modelRef == "" || requestType == "" {
		return apierrors.UnprocessableEntity("ReportEntitlementUsageMetric.InvalidAiUsage", "commit without reservation requires model and requestType")
	}
	st.AIModelRef, st.AIRequestType = modelRef, requestType
	m, err := q.GetAIModel(ctx, db.GetAIModelParams{OrganizationID: st.OrganizationID, ModelRef: modelRef})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err == nil {
		st.AIModel = &aicredit.Model{ID: m.ID, Status: aicredit.ModelStatus(m.Status)}
	}
	rows, err := q.GetAIRules(ctx, db.GetAIRulesParams{OrganizationID: st.OrganizationID, LicenseID: st.Pair.LicenseID, EntitlementID: st.Pair.EntitlementID})
	if err != nil {
		return err
	}
	for _, r := range rows {
		var request *aicredit.RequestType
		if r.RequestType != nil {
			value := aicredit.RequestType(*r.RequestType)
			request = &value
		}
		st.AIRules = append(st.AIRules, aicredit.Rule{ID: r.ID, ModelID: r.ModelID, RequestType: request, Active: true, Minimum: *decimalOf(r.MinimumCreditsPerRequest), Maximum: decimalOf(r.MaximumCreditsPerRequest), ChargeOnError: aicredit.ChargeOnError(r.ChargeOnError), Rates: aicredit.Rates{Request: decimalOf(r.RatePerRequest), InputToken: decimalOf(r.RatePerInputToken), CachedInputToken: decimalOf(r.RatePerCachedInputToken), CacheWriteToken: decimalOf(r.RatePerCacheWriteToken), OutputToken: decimalOf(r.RatePerOutputToken), Unit: decimalOf(r.RatePerUnit), Second: decimalOf(r.RatePerSecond)}})
	}
	day := time.Date(st.Now.Year(), st.Now.Month(), st.Now.Day(), 0, 0, 0, 0, time.UTC)
	st.UnauthorizedAlready, err = q.AIUnauthorizedRecordedToday(ctx, db.AIUnauthorizedRecordedTodayParams{OrganizationID: st.OrganizationID, InstanceID: st.Pair.InstanceID, EntitlementID: st.Pair.EntitlementID, ModelRef: modelRef, RequestType: db.AiRequestType(requestType), DayStart: timestamp(day), DayEnd: timestamp(day.AddDate(0, 0, 1))})
	return err
}
