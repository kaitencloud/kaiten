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

// The stored document is a contract with the history reads: its member names
// and its exact decimal strings are pinned here.
func TestAIPlanSnapshotsRuleLicenceAndWarnings(t *testing.T) {
	model := &aicredit.Model{ID: uuid.New(), Status: aicredit.Deprecated}
	other := uuid.New()
	completion, embedding := aicredit.Completion, aicredit.Embedding
	rate, cached, maximum := decimal.RequireFromString("0.001"), decimal.RequireFromString("0.0000000001"), decimal.RequireFromString("2.5")
	rule := func(modelID *uuid.UUID, request *aicredit.RequestType) aicredit.Rule {
		return aicredit.Rule{ID: uuid.New(), ModelID: modelID, RequestType: request, Active: true, Rates: aicredit.Rates{InputToken: &rate, CachedInputToken: &cached}, Minimum: decimal.RequireFromString("0.5"), Maximum: &maximum, ChargeOnError: aicredit.ProviderErrorOnly}
	}
	exactTyped, exactAll, anyTyped, anyAll := rule(&model.ID, &completion), rule(&model.ID, nil), rule(nil, &completion), rule(nil, nil)
	license := uuid.New()
	status := aicredit.Success
	tokens := int64(1000)
	for _, tc := range []struct {
		name        string
		rules       []aicredit.Rule
		winner      *aicredit.Rule
		specificity string
	}{
		{"exact typed", []aicredit.Rule{anyAll, anyTyped, exactAll, exactTyped}, &exactTyped, "EXACT_TYPED"},
		{"exact all", []aicredit.Rule{anyAll, anyTyped, exactAll}, &exactAll, "EXACT_ALL"},
		{"any typed", []aicredit.Rule{anyAll, anyTyped}, &anyTyped, "ANY_TYPED"},
		{"any all", []aicredit.Rule{anyAll, rule(&other, nil), rule(nil, &embedding)}, &anyAll, "ANY_ALL"},
		{"no rule", []aicredit.Rule{rule(&other, nil)}, nil, ""},
	} {
		for _, phase := range []string{"reserve", "commit"} {
			t.Run(tc.name+", "+phase, func(t *testing.T) {
				st := &State{Pair: &UsageContext{LicenseID: license, EntitlementType: db.EntitlementTypeNUMBERAICREDIT, EntitlementSlug: "pool", EffectiveValue: []byte(`{"type":"number","value":-1}`)}, Now: time.Now().UTC(), Limit: usage.Limit{Threshold: -1}, AggregationMethod: "SUM", AIModel: model, AIModelRef: "model", AIRequestType: completion, AIRules: tc.rules}
				value := &schema.AiUsageValue{Phase: phase, TransactionID: "tx", Usage: &schema.AiUsage{InputTokens: &tokens}}
				if phase == "commit" {
					value.RequestStatus = &status
				}
				effect, err := (aiKind{}).plan(st, &Command{AI: value})
				if err != nil {
					t.Fatal(err)
				}
				if tc.winner == nil && phase == "reserve" {
					if effect.Refusal == nil || effect.AIRow != nil {
						t.Fatalf("an unauthorized reserve is refused and records nothing: %+v", effect)
					}
					return
				}
				row := effect.AIRow
				if row.LicenseID == nil || *row.LicenseID != license {
					t.Fatalf("license_id=%v, want the usage context's %s", row.LicenseID, license)
				}
				if !slices.Equal(row.Warnings, effect.Response.AI.Warnings) || !slices.Contains(row.Warnings, schema.AiWarningModelDeprecated) {
					t.Fatalf("row warnings=%v, response warnings=%v", row.Warnings, effect.Response.AI.Warnings)
				}
				if tc.winner == nil {
					if row.Pricing != nil || !slices.Contains(row.Warnings, schema.AiWarningModelNotAuthorized) {
						t.Fatalf("an unauthorized commit has no pricing: %s %v", row.Pricing, row.Warnings)
					}
					return
				}
				want := `{"ruleId":"` + tc.winner.ID.String() + `","specificity":"` + tc.specificity + `","rates":{"perInputToken":"0.001","perCachedInputToken":"0.0000000001"},"minimumCreditsPerRequest":"0.5","maximumCreditsPerRequest":"2.5","chargeOnError":"PROVIDER_ERROR_ONLY"}`
				if string(row.Pricing) != want {
					t.Fatalf("pricing=%s\nwant    %s", row.Pricing, want)
				}
			})
		}
	}
}

func TestAIPricingSnapshotKeepsAnAbsentMaximumNull(t *testing.T) {
	rate := decimal.NewFromInt(2)
	id := uuid.New()
	got, err := pricingSnapshot(&aicredit.Rule{ID: id, Active: true, Rates: aicredit.Rates{Request: &rate}, ChargeOnError: aicredit.Never}, aicredit.AnyAll)
	if err != nil {
		t.Fatal(err)
	}
	if want := `{"ruleId":"` + id.String() + `","specificity":"ANY_ALL","rates":{"perRequest":"2"},"minimumCreditsPerRequest":"0","maximumCreditsPerRequest":null,"chargeOnError":"NEVER"}`; string(got) != want {
		t.Fatalf("pricing=%s\nwant    %s", got, want)
	}
	if got, err := pricingSnapshot(nil, ""); got != nil || err != nil {
		t.Fatalf("no rule, no snapshot: %s %v", got, err)
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
