package reportentitlementusagemetric

import (
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
	st := &State{Pair: &UsageContext{EntitlementType: db.EntitlementTypeNUMBERAICREDIT, EntitlementSlug: "pool", LicenseEntitlementValue: []byte(`{"type":"number","value":-1}`)}, Now: time.Now().UTC(), Limit: usage.Limit{Threshold: -1}, AggregationMethod: "SUM", AIModel: model, AIModelRef: "model", AIRequestType: aicredit.Completion, AIRules: []aicredit.Rule{{Active: true, Rates: aicredit.Rates{InputToken: &rate}, Maximum: &maximum, ChargeOnError: aicredit.Never}}}
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

func TestAICounterPrecisionExhaustionDoesNotWriteCorruptEvidence(t *testing.T) {
	rate := decimal.RequireFromString("0.000001")
	st := &State{Pair: &UsageContext{EntitlementType: db.EntitlementTypeNUMBERAICREDIT, LicenseEntitlementValue: []byte(`{"type":"number","value":-1}`)}, Limit: usage.Limit{Threshold: -1}, Resolution: usage.Resolution{Current: usage.Counter{Value: 10000000000}}, AIModel: &aicredit.Model{ID: uuid.New(), Status: aicredit.Active}, AIRules: []aicredit.Rule{{Active: true, Rates: aicredit.Rates{Request: &rate}, ChargeOnError: aicredit.Never}}}
	status := aicredit.Success
	if effect, err := (aiKind{}).plan(st, &Command{AI: &schema.AiUsageValue{Phase: "commit", TransactionID: "precision", RequestStatus: &status}}); err == nil || effect != nil {
		t.Fatalf("precision failure must not apply money: effect=%v err=%v", effect, err)
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
			st := &State{Pair: &UsageContext{EntitlementType: db.EntitlementTypeNUMBERAICREDIT, LicenseEntitlementValue: []byte(`{"type":"number","value":0.3}`)}, Limit: usage.Limit{Threshold: tc.limit}, AggregationMethod: "SUM", Reserved: decimal.RequireFromString(tc.reserved), Resolution: usage.Resolution{Current: usage.Counter{Value: tc.before}}}
			eff, err := (numberKind{}).plan(st, &Command{Value: tc.value, Behavior: usage.Append})
			if err != nil || eff.Refusal != nil {
				t.Fatalf("report refused: effect=%+v error=%v", eff, err)
			}
		})
	}
}
