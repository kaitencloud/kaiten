package reportentitlementusagemetric

import (
	"math"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
)

func TestAICommitPreservesLargeComputedUsageUnderSmallCap(t *testing.T) {
	rate, maximum := decimal.NewFromInt(1), decimal.NewFromInt(1)
	model := &aicredit.Model{ID: uuid.New(), Status: aicredit.Active}
	st := &State{Pair: &UsageContext{EntitlementType: db.EntitlementTypeNUMBERAICREDIT, EntitlementSlug: "pool", EffectiveValue: []byte(`{"type":"number","value":-1}`)}, Now: time.Now().UTC(), Limit: usage.Limit{Threshold: -1}, AggregationMethod: "SUM", AIModel: model, AIModelRef: "model", AIRequestType: aicredit.Completion, AIRules: []aicredit.Rule{{Active: true, Rates: aicredit.Rates{InputToken: &rate}, Maximum: &maximum, ChargeOnError: aicredit.Never}}}
	status := aicredit.Success
	tokens := int64(100000000000000)
	effect, err := (aiKind{}).plan(st, &Command{AI: &schema.AiUsageValue{Phase: "commit", TransactionID: "large", RequestStatus: &status, Usage: &schema.AiUsage{InputTokens: &tokens}}})
	if err != nil {
		t.Fatal(err)
	}
	if effect.Response.Value.Number.Value != 1 || *effect.Response.AI.Credits.Computed != "100000000000000" {
		t.Fatalf("unexpected charge: %+v", effect.Response)
	}
}

// This test used to be TestAICounterPrecisionExhaustionDoesNotWriteCorruptEvidence
// and pinned the opposite: a charge the float64 counter cannot represent within
// half a quantum failed the commit (500, rollback). That lost the record of an
// inference that had already happened and been paid for, and from about 1e10
// credits in a window it failed every charged commit to the pool. The evidence
// is not corrupt: credits_charged is NUMERIC and stays exact. Only the float
// counter drifts, so the commit is recorded and says so.
func TestAICounterPrecisionDegradedStillRecordsTheInference(t *testing.T) {
	rate := decimal.RequireFromString("0.000001")
	st := &State{Pair: &UsageContext{EntitlementType: db.EntitlementTypeNUMBERAICREDIT, EffectiveValue: []byte(`{"type":"number","value":-1}`)}, Limit: usage.Limit{Threshold: -1}, AggregationMethod: "SUM", Resolution: usage.Resolution{Current: usage.Counter{Value: 10000000000}}, AIModel: &aicredit.Model{ID: uuid.New(), Status: aicredit.Active}, AIRules: []aicredit.Rule{{Active: true, Rates: aicredit.Rates{Request: &rate}, ChargeOnError: aicredit.Never}}}
	status := aicredit.Success
	effect, err := (aiKind{}).plan(st, &Command{AI: &schema.AiUsageValue{Phase: "commit", TransactionID: "precision", RequestStatus: &status}})
	if err != nil {
		t.Fatalf("an inference that happened must be recorded: %v", err)
	}
	if !effect.Accepted || effect.AIRow == nil || effect.Counter == nil {
		t.Fatalf("the commit must be applied: %+v", effect)
	}
	if charged := decimalOf(effect.AIRow.CreditsCharged); charged == nil || !charged.Equal(rate) || *effect.Response.AI.Credits.Charged != "0.000001" {
		t.Fatalf("the exact charge must be kept: row=%v response=%s", charged, *effect.Response.AI.Credits.Charged)
	}
	if !slices.Contains(effect.Response.AI.Warnings, schema.AiWarningCounterPrecisionDegraded) {
		t.Fatalf("warnings=%v, want %s", effect.Response.AI.Warnings, schema.AiWarningCounterPrecisionDegraded)
	}
	if effect.AIRow.ValueBefore == nil || effect.AIRow.ValueAfter == nil {
		t.Fatal("a charged row keeps the counter around the charge, drift included")
	}
}

func TestAICounterWithinPrecisionCarriesNoWarning(t *testing.T) {
	rate := decimal.RequireFromString("0.000001")
	st := &State{Pair: &UsageContext{EntitlementType: db.EntitlementTypeNUMBERAICREDIT, EffectiveValue: []byte(`{"type":"number","value":-1}`)}, Limit: usage.Limit{Threshold: -1}, AggregationMethod: "SUM", Resolution: usage.Resolution{Current: usage.Counter{Value: 1000}}, AIModel: &aicredit.Model{ID: uuid.New(), Status: aicredit.Active}, AIRules: []aicredit.Rule{{Active: true, Rates: aicredit.Rates{Request: &rate}, ChargeOnError: aicredit.Never}}}
	status := aicredit.Success
	effect, err := (aiKind{}).plan(st, &Command{AI: &schema.AiUsageValue{Phase: "commit", TransactionID: "precise", RequestStatus: &status}})
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(effect.Response.AI.Warnings, schema.AiWarningCounterPrecisionDegraded) {
		t.Fatalf("unexpected warning: %v", effect.Response.AI.Warnings)
	}
}

// Infinity is not drift: there is no counter left to store or gate on.
func TestAICounterOverflowStillFailsTheCommit(t *testing.T) {
	rate := decimal.RequireFromString("1")
	st := &State{Pair: &UsageContext{EntitlementType: db.EntitlementTypeNUMBERAICREDIT, EffectiveValue: []byte(`{"type":"number","value":-1}`)}, Limit: usage.Limit{Threshold: -1}, AggregationMethod: "SUM", Resolution: usage.Resolution{Current: usage.Counter{Value: math.Inf(1)}}, AIModel: &aicredit.Model{ID: uuid.New(), Status: aicredit.Active}, AIRules: []aicredit.Rule{{Active: true, Rates: aicredit.Rates{Request: &rate}, ChargeOnError: aicredit.Never}}}
	status := aicredit.Success
	if effect, err := (aiKind{}).plan(st, &Command{AI: &schema.AiUsageValue{Phase: "commit", TransactionID: "overflow", RequestStatus: &status}}); err == nil || effect != nil {
		t.Fatalf("an infinite counter must not be applied: effect=%v err=%v", effect, err)
	}
}

func TestAIReleaseWithoutReservationPlansNoWrite(t *testing.T) {
	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	// A stale window, an unknown model and no rule: none of them may turn a
	// release of nothing into a counter write, a row or an event.
	st := &State{Pair: &UsageContext{EntitlementType: db.EntitlementTypeNUMBERAICREDIT, EntitlementSlug: "pool", EffectiveValue: []byte(`{"type":"number","value":10}`)}, Now: start.AddDate(0, 0, 3), Limit: usage.Limit{Threshold: 10}, AggregationMethod: "SUM", Reserved: decimal.NewFromInt(4), Resolution: usage.Resolution{Window: usage.Window{Start: &start}, Closures: []usage.Closure{{Value: 9, NewPeriodStart: start}}}}
	status := aicredit.NotSent
	effect, err := (aiKind{}).plan(st, &Command{AI: &schema.AiUsageValue{Phase: "commit", TransactionID: "never-reserved", RequestStatus: &status}})
	if err != nil {
		t.Fatal(err)
	}
	if effect.AIRow != nil || effect.Counter != nil || len(effect.Events) != 0 || effect.Accepted || effect.Refusal != nil {
		t.Fatalf("a release of nothing must plan no write: %+v", effect)
	}
	ai := effect.Response.AI
	if ai.Status != "RELEASED" || *ai.Credits.Charged != "0" || ai.Authorized != nil || len(ai.Warnings) != 1 || ai.Warnings[0] != schema.AiWarningNoReservation {
		t.Fatalf("unexpected outcome: %+v", ai)
	}
	if *effect.Response.Reserved != "4" || *ai.Remaining != "6" {
		t.Fatalf("unexpected gauge: reserved=%s remaining=%s", *effect.Response.Reserved, *ai.Remaining)
	}
}

func TestNumericCreditGateAllowsExactDecimalFitAndPartialRefund(t *testing.T) {
	for _, tc := range []struct {
		name                 string
		before, value, limit float64
		reserved             string
	}{
		{"exact fit", 0, 0.1, 0.3, "0.2"},
		{"partial refund", 12, -1, 10, "2"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			st := &State{Pair: &UsageContext{EntitlementType: db.EntitlementTypeNUMBERAICREDIT, EffectiveValue: []byte(`{"type":"number","value":0.3}`)}, Limit: usage.Limit{Threshold: tc.limit}, AggregationMethod: "SUM", Reserved: decimal.RequireFromString(tc.reserved), Resolution: usage.Resolution{Current: usage.Counter{Value: tc.before}}}
			eff, err := (numberKind{}).plan(st, &Command{Value: tc.value, Behavior: usage.Append})
			if err != nil || eff.Refusal != nil {
				t.Fatalf("report refused: effect=%+v error=%v", eff, err)
			}
		})
	}
}
