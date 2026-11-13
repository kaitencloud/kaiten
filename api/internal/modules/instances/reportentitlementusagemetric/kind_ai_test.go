package reportentitlementusagemetric

import (
	"encoding/json"
	"math"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
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

// A release of what was never reserved closes its transactionId with a
// tombstone and nothing else: no model or rule is resolved, no counter moves
// beyond the rollover every phase persists, and no usage or unauthorized
// event is emitted, whatever model the release names.
func TestAIReleaseWithoutReservationPlansATombstone(t *testing.T) {
	start := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	license, hash := uuid.New(), make([]byte, 32)
	status, embedding := aicredit.NotSent, aicredit.Embedding
	state := func(stale bool) *State {
		st := &State{OrganizationID: uuid.New(), Pair: &UsageContext{InstanceID: uuid.New(), EntitlementID: uuid.New(), LicenseID: license, EntitlementType: db.EntitlementTypeNUMBERAICREDIT, EntitlementSlug: "pool", EffectiveValue: []byte(`{"type":"number","value":10}`)}, Now: start.AddDate(0, 0, 3), Limit: usage.Limit{Threshold: 10}, AggregationMethod: "SUM", Reserved: decimal.NewFromInt(4), AIHash: hash, Resolution: usage.Resolution{Window: usage.Window{Start: &start}}}
		if stale {
			st.Resolution.Closures = []usage.Closure{{Value: 9, NewPeriodStart: start}}
		}
		return st
	}
	for _, tc := range []struct {
		name            string
		stale           bool
		modelRef        string
		requestType     aicredit.RequestType
		wantRequestType db.AiRequestType
	}{
		{"nothing named", false, "", "", tombstoneRequestType},
		{"model and request type as sent, never looked up", false, "missing-model", embedding, db.AiRequestTypeEMBEDDING},
		{"a stale window is rolled over, as on every phase", true, "", "", tombstoneRequestType},
	} {
		t.Run(tc.name, func(t *testing.T) {
			st := state(tc.stale)
			st.AIModelRef, st.AIRequestType = tc.modelRef, tc.requestType
			effect, err := (aiKind{}).plan(st, &Command{AI: &schema.AiUsageValue{Phase: "commit", TransactionID: "never-reserved", RequestStatus: &status}})
			if err != nil {
				t.Fatal(err)
			}
			if effect.Accepted || effect.Refusal != nil || effect.AIUpdate || effect.AIPhase != "commit" {
				t.Fatalf("a tombstone is an insert that counts nothing: %+v", effect)
			}
			if tc.stale {
				if effect.Counter == nil || effect.Counter.Value != 0 || len(effect.Events) != 1 || effect.Events[0].Metadata.Name != events.InstanceEntitlementUsagePeriodRolledOver.Name {
					t.Fatalf("the rollover is persisted and nothing else: counter=%+v events=%+v", effect.Counter, effect.Events)
				}
			} else if effect.Counter != nil || len(effect.Events) != 0 {
				t.Fatalf("no counter write and no event: counter=%+v events=%+v", effect.Counter, effect.Events)
			}
			row := effect.AIRow
			if row == nil || row.Status != db.AiInferenceStatusRELEASED || row.TransactionID != "never-reserved" || row.OrganizationID != st.OrganizationID || row.InstanceID != st.Pair.InstanceID || row.EntitlementID != st.Pair.EntitlementID {
				t.Fatalf("tombstone identity: %+v", row)
			}
			if string(row.RequestHash) != string(hash) || string(row.CommitHash) != string(hash) || !row.CommittedAt.Valid || !row.ReportedAt.Valid || row.ExpiresAt.Valid {
				t.Fatalf("tombstone replay evidence: %+v", row)
			}
			if row.ModelRef != tc.modelRef || row.RequestType != tc.wantRequestType || row.ModelID != nil || row.CreditConversionRuleID != nil || row.Pricing != nil {
				t.Fatalf("nothing is resolved: %+v", row)
			}
			if row.RequestStatus == nil || *row.RequestStatus != db.AiRequestStatus(aicredit.NotSent) || row.Authorized == nil || !*row.Authorized || row.DenialReason != nil {
				t.Fatalf("a tombstone is not an unauthorized use: %+v", row)
			}
			if got := decimalOf(row.CreditsCharged); got == nil || !got.IsZero() || !decimalOf(row.CreditsComputed).IsZero() || row.CreditsReserved.Valid || row.ValueBefore != nil || row.ValueAfter != nil || row.ReportSeq != nil || row.VendorCostReported.Valid || row.VendorCostComputed.Valid {
				t.Fatalf("zero credits, no counter snapshot, no journal link, no vendor cost: %+v", row)
			}
			if row.LicenseID == nil || *row.LicenseID != license || !slices.Equal(row.Warnings, []string{schema.AiWarningNoReservation}) {
				t.Fatalf("licence and warning: %+v", row)
			}
			ai := effect.Response.AI
			if ai.Status != "RELEASED" || *ai.Credits.Charged != "0" || *ai.Credits.Computed != "0" || ai.Credits.Reserved != nil || ai.Authorized != nil || ai.Rule != nil || !slices.Equal(ai.Warnings, []string{schema.AiWarningNoReservation}) {
				t.Fatalf("unexpected outcome: %+v", ai)
			}
			if *effect.Response.Reserved != "4" || *ai.Remaining != "6" {
				t.Fatalf("unexpected gauge: reserved=%s remaining=%s", *effect.Response.Reserved, *ai.Remaining)
			}
		})
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
				answered := effect.Response.AI.Rule
				if tc.winner == nil {
					if row.Pricing != nil || answered != nil || !slices.Contains(row.Warnings, schema.AiWarningModelNotAuthorized) {
						t.Fatalf("an unauthorized commit has no pricing and names no rule: %s %+v %v", row.Pricing, answered, row.Warnings)
					}
					return
				}
				if answered == nil || answered.ID != tc.winner.ID || string(answered.Specificity) != tc.specificity {
					t.Fatalf("answered rule=%+v, want %s %s", answered, tc.winner.ID, tc.specificity)
				}
				want := `{"ruleId":"` + tc.winner.ID.String() + `","specificity":"` + tc.specificity + `","rates":{"perInputToken":"0.001","perCachedInputToken":"0.0000000001"},"minimumCreditsPerRequest":"0.5","maximumCreditsPerRequest":"2.5","chargeOnError":"PROVIDER_ERROR_ONLY"}`
				if string(row.Pricing) != want {
					t.Fatalf("pricing=%s\nwant    %s", row.Pricing, want)
				}
			})
		}
	}
}

// A phase's answer is stored as JSON and replayed from it. One stored before
// the outcome named its rule must replay without the member, not with a null.
func TestAIOutcomeStoredWithoutARuleReplaysWithoutOne(t *testing.T) {
	stored := `{"transactionId":"tx","phase":"commit","status":"COMMITTED","credits":{"computed":"1","charged":"1"},"remaining":"9","authorized":true,"warnings":[]}`
	var outcome schema.AiUsageOutcome
	if err := json.Unmarshal([]byte(stored), &outcome); err != nil {
		t.Fatal(err)
	}
	replayed, err := json.Marshal(outcome)
	if err != nil {
		t.Fatal(err)
	}
	if string(replayed) != stored {
		t.Fatalf("replayed=%s\nstored  =%s", replayed, stored)
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

func TestAICommitRecordsVendorCosts(t *testing.T) {
	inputCost, requestCost, rate := decimal.RequireFromString("0.000003"), decimal.RequireFromString("0.01"), decimal.NewFromInt(1)
	costs := &aicredit.Costs{InputToken: &inputCost, Request: &requestCost}
	known := &aicredit.Model{ID: uuid.New(), Status: aicredit.Active}
	archived := &aicredit.Model{ID: uuid.New(), Status: aicredit.Archived}
	tokens, duration := int64(1000), int64(60000)
	reported := "0.0123"
	text := func(d *decimal.Decimal) string {
		if d == nil {
			return "NULL"
		}
		return d.String()
	}
	for _, tc := range []struct {
		name         string
		model        *aicredit.Model
		costs        *aicredit.Costs
		status       aicredit.RequestStatus
		usage        *schema.AiUsage
		vendorCost   *string
		wantReported string
		wantComputed string
	}{
		{"success, reported and computed", known, costs, aicredit.Success, &schema.AiUsage{InputTokens: &tokens}, &reported, "0.0123", "0.013"},
		{"success, nothing reported", known, costs, aicredit.Success, &schema.AiUsage{InputTokens: &tokens}, nil, "NULL", "0.013"},
		{"success without usage still costs the request", known, costs, aicredit.Success, nil, nil, "NULL", "0.01"},
		{"model without costs", known, &aicredit.Costs{}, aicredit.Success, &schema.AiUsage{InputTokens: &tokens}, &reported, "0.0123", "NULL"},
		{"unknown model", nil, nil, aicredit.Success, &schema.AiUsage{InputTokens: &tokens}, &reported, "0.0123", "NULL"},
		{"archived model still cost the provider", archived, costs, aicredit.Success, &schema.AiUsage{InputTokens: &tokens}, nil, "NULL", "0.013"},
		{"provider error with quantities", known, costs, aicredit.ProviderError, &schema.AiUsage{InputTokens: &tokens}, nil, "NULL", "0.013"},
		{"customer error with quantities", known, costs, aicredit.CustomerError, &schema.AiUsage{InputTokens: &tokens}, nil, "NULL", "0.013"},
		{"provider error without quantities", known, costs, aicredit.ProviderError, nil, &reported, "0.0123", "NULL"},
		{"customer error with an empty usage", known, costs, aicredit.CustomerError, &schema.AiUsage{}, nil, "NULL", "NULL"},
		// The catalogue has no duration cost: nothing costed was reported, and
		// the per-request cost alone would be a guess.
		{"provider error with a duration alone", known, costs, aicredit.ProviderError, &schema.AiUsage{DurationMS: &duration}, &reported, "0.0123", "NULL"},
		{"customer error with a duration alone", known, costs, aicredit.CustomerError, &schema.AiUsage{DurationMS: &duration}, nil, "NULL", "NULL"},
		{"provider error with a duration and tokens", known, costs, aicredit.ProviderError, &schema.AiUsage{DurationMS: &duration, InputTokens: &tokens}, nil, "NULL", "0.013"},
		{"success with a duration alone still costs the request", known, costs, aicredit.Success, &schema.AiUsage{DurationMS: &duration}, nil, "NULL", "0.01"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			st := &State{Pair: &UsageContext{EntitlementType: db.EntitlementTypeNUMBERAICREDIT, EntitlementSlug: "pool", EffectiveValue: []byte(`{"type":"number","value":-1}`)}, Now: time.Now().UTC(), Limit: usage.Limit{Threshold: -1}, AggregationMethod: "SUM", AIModel: tc.model, AIModelCosts: tc.costs, AIModelRef: "model", AIRequestType: aicredit.Completion, AIRules: []aicredit.Rule{{Active: true, Rates: aicredit.Rates{Request: &rate}, ChargeOnError: aicredit.Never}}}
			without, err := (aiKind{}).plan(st, &Command{AI: &schema.AiUsageValue{Phase: "commit", TransactionID: "cost", RequestStatus: &tc.status, Usage: tc.usage}})
			if err != nil {
				t.Fatal(err)
			}
			effect, err := (aiKind{}).plan(st, &Command{AI: &schema.AiUsageValue{Phase: "commit", TransactionID: "cost", RequestStatus: &tc.status, Usage: tc.usage, VendorCost: tc.vendorCost}})
			if err != nil {
				t.Fatal(err)
			}
			if got := text(decimalOf(effect.AIRow.VendorCostReported)); got != tc.wantReported {
				t.Fatalf("reported=%s, want %s", got, tc.wantReported)
			}
			if got := text(decimalOf(effect.AIRow.VendorCostComputed)); got != tc.wantComputed {
				t.Fatalf("computed=%s, want %s", got, tc.wantComputed)
			}
			if *effect.Response.AI.Credits.Charged != *without.Response.AI.Credits.Charged {
				t.Fatalf("a vendor cost changed the charge: %s, was %s", *effect.Response.AI.Credits.Charged, *without.Response.AI.Credits.Charged)
			}
		})
	}
}

// A reservation costs the provider nothing yet, and a release never did.
func TestAIReserveAndReleaseRecordNoComputedVendorCost(t *testing.T) {
	inputCost, rate := decimal.RequireFromString("0.000003"), decimal.NewFromInt(1)
	tokens := int64(1000)
	st := func() *State {
		return &State{Pair: &UsageContext{EntitlementType: db.EntitlementTypeNUMBERAICREDIT, EntitlementSlug: "pool", EffectiveValue: []byte(`{"type":"number","value":-1}`)}, Now: time.Now().UTC(), Limit: usage.Limit{Threshold: -1}, AggregationMethod: "SUM", AIModel: &aicredit.Model{ID: uuid.New(), Status: aicredit.Active}, AIModelCosts: &aicredit.Costs{InputToken: &inputCost}, AIModelRef: "model", AIRequestType: aicredit.Completion, AIRules: []aicredit.Rule{{Active: true, Rates: aicredit.Rates{Request: &rate}, ChargeOnError: aicredit.Never}}}
	}
	reserve, err := (aiKind{}).plan(st(), &Command{AI: &schema.AiUsageValue{Phase: "reserve", TransactionID: "held", Usage: &schema.AiUsage{InputTokens: &tokens}}})
	if err != nil {
		t.Fatal(err)
	}
	if reserve.AIRow.VendorCostReported.Valid || reserve.AIRow.VendorCostComputed.Valid {
		t.Fatalf("a reservation has no vendor cost: %+v", reserve.AIRow)
	}
	// The release closes that reservation: the estimate's quantities are
	// repeated, and still cost nothing.
	released := st()
	released.Operation = reserve.AIRow
	notSent := aicredit.NotSent
	release, err := (aiKind{}).plan(released, &Command{AI: &schema.AiUsageValue{Phase: "commit", TransactionID: "held", RequestStatus: &notSent, Usage: &schema.AiUsage{InputTokens: &tokens}}})
	if err != nil {
		t.Fatal(err)
	}
	if release.AIRow.Status != db.AiInferenceStatusRELEASED || release.AIRow.VendorCostComputed.Valid {
		t.Fatalf("a request that was never sent has no computed cost: %+v", release.AIRow)
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
