package reportentitlementusagemetric

import (
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type aiKind struct{}

func (aiKind) plan(st *State, cmd *Command) (*Effect, error) {
	v := cmd.AI
	rule, _ := aicredit.Resolve(st.AIRules, st.AIModel, st.AIRequestType)
	warnings := []string{}
	authorized := rule != nil
	denial := ""
	if st.AIModel == nil {
		denial = "UNKNOWN_MODEL"
	} else if st.AIModel.Status == aicredit.Archived {
		denial = "MODEL_ARCHIVED"
	} else if rule == nil {
		denial = "NO_RULE"
	}
	if st.AIModel != nil && st.AIModel.Status == aicredit.Deprecated {
		warnings = append(warnings, "MODEL_DEPRECATED")
	}
	status := aicredit.Success
	if v.RequestStatus != nil {
		status = *v.RequestStatus
	}
	quantity := aicredit.Usage{}
	if v.Usage != nil {
		u := v.Usage
		quantity = aicredit.Usage{InputTokens: u.InputTokens, CacheReadInputTokens: u.CacheReadInputTokens, CacheWriteInputTokens: u.CacheWriteInputTokens, OutputTokens: u.OutputTokens, DurationMS: u.DurationMS}
		if u.Units != nil {
			units, err := decimal.NewFromString(*u.Units)
			if err != nil {
				return nil, err
			}
			quantity.Units = &units
		}
	}
	charge := aicredit.Charge{}
	var err error
	if rule != nil {
		charge, err = aicredit.Price(*rule, quantity, status)
		if err != nil {
			return nil, err
		}
	}
	eff := &Effect{}
	if v.Phase == "reserve" && !authorized {
		code := "ModelNotAuthorized"
		if st.AIModel == nil {
			code = "UnknownModel"
		}
		eff.Refusal = apierrors.UnprocessableEntity("ReportEntitlementUsageMetric."+code, "model has no authorized conversion rule")
		eff.emit(events.EntitlementUsageReportRejected, InstanceEntitlementUsageReportAccepted{EntitlementSlug: st.Pair.EntitlementSlug, Behavior: BehaviorAppend, Status: events.UsageReportStatusRejected})
		return eff, nil
	}
	before := st.Resolution.Current
	reserved := st.Reserved
	row := db.AiInference{ID: uuid.New(), OrganizationID: st.OrganizationID, InstanceID: st.Pair.InstanceID, EntitlementID: st.Pair.EntitlementID, TransactionID: v.TransactionID, ReportedAt: timestamp(st.Now), ModelRef: st.AIModelRef, RequestType: db.AiRequestType(st.AIRequestType), RequestHash: st.AIHash}
	if st.Operation != nil {
		row = *st.Operation
	}
	row.ModelRef = st.AIModelRef
	row.RequestType = db.AiRequestType(st.AIRequestType)
	if st.AIModel != nil {
		row.ModelID = &st.AIModel.ID
	} else {
		row.ModelID = nil
	}
	if rule != nil {
		row.CreditConversionRuleID = &rule.ID
	} else {
		row.CreditConversionRuleID = nil
	}
	outcome := &schema.AiUsageOutcome{TransactionID: v.TransactionID, Phase: v.Phase, Warnings: warnings}
	if v.Phase == "reserve" {
		if st.Operation != nil {
			return nil, apierrors.Conflict("ReportEntitlementUsageMetric.TransactionIdReused", "reservation already exists")
		}
		amount := charge.Charged
		fits := true
		if !st.Limit.Unlimited() && !math.IsInf(st.Limit.Maximum(), 1) {
			headroom := decimal.NewFromFloat(st.Limit.Maximum()).Sub(decimal.NewFromFloat(before.Value)).Sub(reserved)
			fits = !amount.IsPositive() || amount.LessThanOrEqual(headroom)
		}
		if !fits {
			eff.Refusal = apierrors.Conflict("ReportEntitlementUsageMetric.ThresholdExceeded", "reservation exceeds remaining credits")
			eff.emit(events.EntitlementUsageReportRejected, InstanceEntitlementUsageReportAccepted{EntitlementSlug: st.Pair.EntitlementSlug, Value: amount.InexactFloat64(), Behavior: BehaviorAppend, Status: events.UsageReportStatusRejected})
			return eff, nil
		}
		ttl := st.ReservationTTL
		if v.TTLSeconds != nil {
			ttl = time.Duration(*v.TTLSeconds) * time.Second
		}
		expires := st.Now.Add(ttl)
		row.Status = db.AiInferenceStatusRESERVED
		row.CreditsReserved = numeric(amount)
		row.ExpiresAt = timestamp(expires)
		reserved = reserved.Add(amount)
		outcome.Status = "RESERVED"
		outcome.ExpiresAt = &expires
		text := amount.String()
		outcome.Credits.Reserved = &text
		if charge.MissingInput {
			outcome.Warnings = append(outcome.Warnings, "ESTIMATE_INCOMPLETE")
		}
	} else {
		if row.Status == db.AiInferenceStatusRESERVED && row.ExpiresAt.Valid && row.ExpiresAt.Time.After(st.Now) {
			reserved = reserved.Sub(*decimalOf(row.CreditsReserved))
		}
		if st.Operation != nil && (row.Status == db.AiInferenceStatusEXPIRED || row.Status == db.AiInferenceStatusRELEASED || (row.ExpiresAt.Valid && !row.ExpiresAt.Time.After(st.Now))) {
			outcome.Warnings = append(outcome.Warnings, "RESERVATION_EXPIRED")
		}
		row.Status = db.AiInferenceStatusCOMMITTED
		outcome.Status = "COMMITTED"
		if status == aicredit.NotSent {
			row.Status = db.AiInferenceStatusRELEASED
			outcome.Status = "RELEASED"
		}
		row.CommittedAt = timestamp(st.Now)
		requestStatus := db.AiRequestStatus(status)
		row.RequestStatus = &requestStatus
		row.Authorized = &authorized
		if denial != "" {
			row.DenialReason = &denial
			warning := "MODEL_NOT_AUTHORIZED"
			if denial == "UNKNOWN_MODEL" {
				warning = "UNKNOWN_MODEL"
			}
			outcome.Warnings = append(outcome.Warnings, warning)
		} else {
			row.DenialReason = nil
		}
		row.CreditsComputed = numeric(charge.Computed)
		row.CreditsCharged = numeric(charge.Charged)
		row.CommitHash = st.AIHash
		if v.Usage != nil {
			row.InputTokens = v.Usage.InputTokens
			row.CacheReadInputTokens = v.Usage.CacheReadInputTokens
			row.CacheWriteInputTokens = v.Usage.CacheWriteInputTokens
			row.OutputTokens = v.Usage.OutputTokens
			row.DurationMs = v.Usage.DurationMS
			row.UnitType = v.Usage.UnitType
			row.Units = numericOrEmpty(quantity.Units)
		} else {
			row.InputTokens = nil
			row.CacheReadInputTokens = nil
			row.CacheWriteInputTokens = nil
			row.OutputTokens = nil
			row.DurationMs = nil
			row.UnitType = nil
			row.Units = numericOrEmpty(nil)
		}
		row.ValueBefore = nil
		row.ValueAfter = nil
		if charge.Charged.IsPositive() {
			after, err := usage.Fold(before, charge.Charged.InexactFloat64(), usage.Append, "SUM")
			if err != nil {
				return nil, err
			}
			eff.rollover(st)
			eff.Counter = &after
			if math.IsInf(after.Value, 0) || math.Abs((after.Value-before.Value)-charge.Charged.InexactFloat64()) > 0.0000005 {
				return nil, fmt.Errorf("AI credit counter precision exhausted: charge cannot be represented within half a quantum")
			}
			valueBefore, valueAfter := before.Value, after.Value
			row.ValueBefore = &valueBefore
			row.ValueAfter = &valueAfter
			eff.emit(events.EntitlementUsageReportAccepted, InstanceEntitlementUsageReportAccepted{EntitlementSlug: st.Pair.EntitlementSlug, Value: charge.Charged.InexactFloat64(), Behavior: BehaviorAppend, EventCount: after.EventCount, Status: events.UsageReportStatusAccepted})
			before = after
		}
		row.WindowStart = timestampOrEmpty(st.Resolution.Window.Start)
		computed, charged := charge.Computed.String(), charge.Charged.String()
		outcome.Credits.Computed = &computed
		outcome.Credits.Charged = &charged
		outcome.Authorized = &authorized
		if previous := decimalOf(row.CreditsReserved); previous != nil {
			text := previous.String()
			outcome.Credits.Reserved = &text
		}
		if charge.MissingInput {
			outcome.Warnings = append(outcome.Warnings, "CONVERSION_INPUT_MISSING")
		}
		if !st.Limit.Unlimited() && before.Value > st.Limit.Maximum() {
			outcome.Warnings = append(outcome.Warnings, "OVERDRAWN")
		}
	}
	response, err := usage.Present(st.gauge(before))
	if err != nil {
		return nil, err
	}
	reservedText := reserved.String()
	response.Reserved = &reservedText
	response.AI = outcome
	if !st.Limit.Unlimited() {
		remaining := decimal.NewFromFloat(st.Limit.Threshold).Sub(decimal.NewFromFloat(before.Value)).Sub(reserved).String()
		outcome.Remaining = &remaining
	}
	eff.Response = response
	eff.AIRow = &row
	eff.AIUpdate = st.Operation != nil
	eff.AIPhase = v.Phase
	if eff.Counter != nil {
		eff.crossings(st, st.Pair.WarningThresholdPercent, st.Resolution.Current.Value, before.Value, response)
		if !st.Limit.Unlimited() && st.Limit.OveragePercent > 0 && st.Resolution.Current.Value <= st.Limit.Maximum() && before.Value > st.Limit.Maximum() {
			eff.emit(events.InstanceEntitlementMaximumExceeded, InstanceEntitlementCapExceeded{EntitlementSlug: st.Pair.EntitlementSlug, Threshold: st.Limit.Maximum(), Value: before.Value, Overage: before.Value - st.Limit.Maximum()})
		}
	}
	if v.Phase == "commit" && !authorized && !st.UnauthorizedAlready {
		eff.emit(events.InstanceAIModelUsageUnauthorized, InstanceAIModelUsageUnauthorized{EntitlementSlug: st.Pair.EntitlementSlug, Model: st.AIModelRef, RequestType: string(st.AIRequestType), Reason: denial})
	}
	return eff, nil
}
