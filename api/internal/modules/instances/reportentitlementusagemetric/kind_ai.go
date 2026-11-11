package reportentitlementusagemetric

import (
	"encoding/json"
	"fmt"
	"math"
	"slices"
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

// pricingSnapshot is the ai_inference.pricing document: the conversion rule
// as it is applied, in the rule's own decimal strings. Nil when no rule
// applies: an unauthorized operation has no price to explain.
func pricingSnapshot(rule *aicredit.Rule, specificity aicredit.Specificity) ([]byte, error) {
	if rule == nil {
		return nil, nil
	}
	text := func(d *decimal.Decimal) *string {
		if d == nil {
			return nil
		}
		s := d.String()
		return &s
	}
	return json.Marshal(schema.AiInferencePricing{
		RuleID:      rule.ID,
		Specificity: specificity,
		Rates: schema.AiInferenceRates{
			PerRequest:          text(rule.Rates.Request),
			PerInputToken:       text(rule.Rates.InputToken),
			PerCachedInputToken: text(rule.Rates.CachedInputToken),
			PerCacheWriteToken:  text(rule.Rates.CacheWriteToken),
			PerOutputToken:      text(rule.Rates.OutputToken),
			PerUnit:             text(rule.Rates.Unit),
			PerSecond:           text(rule.Rates.Second),
		},
		MinimumCreditsPerRequest: rule.Minimum.String(),
		MaximumCreditsPerRequest: text(rule.Maximum),
		ChargeOnError:            rule.ChargeOnError,
	})
}

// releaseNothing answers a NOT_SENT commit whose transactionId never reserved.
// An SDK releases on every failure path, including the ones that failed before
// its reserve was accepted; recording each as a RELEASED row -- and possibly a
// MODEL_USAGE_UNAUTHORIZED event -- would be evidence of nothing. The effect
// carries no row, no counter and no event, not even a rollover, so the call
// writes nothing and repeating it answers the same.
func (aiKind) releaseNothing(st *State, v *schema.AiUsageValue) (*Effect, error) {
	response, err := usage.Present(st.gauge(st.Resolution.Current))
	if err != nil {
		return nil, err
	}
	zero, reserved := "0", st.Reserved.String()
	outcome := &schema.AiUsageOutcome{TransactionID: v.TransactionID, Phase: v.Phase, Status: "RELEASED", Credits: schema.AiCredits{Computed: &zero, Charged: &zero}, Warnings: []string{schema.AiWarningNoReservation}}
	if !st.Limit.Unlimited() {
		remaining := decimal.NewFromFloat(st.Limit.Threshold).Sub(decimal.NewFromFloat(st.Resolution.Current.Value)).Sub(st.Reserved).String()
		outcome.Remaining = &remaining
	}
	response.Reserved = &reserved
	response.AI = outcome
	return &Effect{Response: response}, nil
}

func (k aiKind) plan(st *State, cmd *Command) (*Effect, error) {
	v := cmd.AI
	if releasesNothing(st, v) {
		return k.releaseNothing(st, v)
	}
	rule, specificity := aicredit.Resolve(st.AIRules, st.AIModel, st.AIRequestType)
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
	// Period maintenance does not depend on what this report decides: a
	// reserve, a refusal and a commit that charges nothing all persist the
	// rollover they resolved, as a numeric report does. Otherwise
	// PERIOD_ROLLED_OVER would wait for the next charged commit.
	eff.rollover(st)
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
	// What explains the row once the rule has been edited or archived: the
	// rule as it priced this phase, and the licence version whose rules were
	// considered -- the one LoadLimits read under the pair's lock, never a
	// second read of the grant. A commit overwrites what its reserve wrote,
	// so an operation no rule prices in the end keeps no snapshot.
	if row.Pricing, err = pricingSnapshot(rule, specificity); err != nil {
		return nil, err
	}
	licenseID := st.Pair.LicenseID
	row.LicenseID = &licenseID
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
			eff.Counter = &after
			eff.Accepted = true
			eff.ReportedValue = charge.Charged.InexactFloat64()
			eff.Behavior = BehaviorAppend
			// A counter that is no longer a number cannot be stored or gated on.
			if math.IsInf(after.Value, 0) || math.IsNaN(after.Value) {
				return nil, fmt.Errorf("AI credit counter overflow: the charge cannot be added to the counter")
			}
			// The counter is a float64 and the charge a 6-decimal number: on a
			// very large counter the sum is off by more than half a quantum
			// (invariant I1). The inference happened and the provider was
			// paid, so it is recorded anyway, with the exact charge in
			// credits_charged, and the drift is reported instead of failing
			// every commit to the pool with a 500.
			if math.Abs((after.Value-before.Value)-charge.Charged.InexactFloat64()) > 0.0000005 {
				outcome.Warnings = append(outcome.Warnings, schema.AiWarningCounterPrecisionDegraded)
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
	// The warnings the phase answers with, as answered: read back by the
	// history without the stored response.
	row.Warnings = slices.Clone(outcome.Warnings)
	eff.Response = response
	eff.AIRow = &row
	eff.AIUpdate = st.Operation != nil
	eff.AIPhase = v.Phase
	// Accepted, not Counter: a rollover alone also sets Counter, and moved nothing.
	if eff.Accepted {
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
