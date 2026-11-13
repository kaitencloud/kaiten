package reportentitlementusagemetric

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestValidateAI(t *testing.T) {
	model, request, status, notSent := "model", aicredit.Completion, aicredit.Success, aicredit.NotSent
	cost, tooPrecise, negative := "0.0123", "0.0000000000001", "-1"
	for _, tc := range []struct {
		name, code string
		value      schema.AiUsageValue
		behavior   Behavior
	}{
		{"missing id", "TransactionIdRequired", schema.AiUsageValue{Phase: "reserve"}, ""},
		{"invalid id", "InvalidTransactionId", schema.AiUsageValue{Phase: "reserve", TransactionID: "spaces forbidden"}, ""},
		{"set", "AiUsageRequiresAppend", schema.AiUsageValue{Phase: "reserve", TransactionID: "tx"}, BehaviorSet},
		{"invalid phase", "InvalidAiUsage", schema.AiUsageValue{Phase: "release", TransactionID: "tx"}, ""},
		{"reserve without model", "InvalidAiUsage", schema.AiUsageValue{Phase: "reserve", TransactionID: "tx", RequestType: &request}, ""},
		{"reserve status", "InvalidAiUsage", schema.AiUsageValue{Phase: "reserve", TransactionID: "tx", Model: &model, RequestType: &request, RequestStatus: &status}, ""},
		{"commit without status", "InvalidAiUsage", schema.AiUsageValue{Phase: "commit", TransactionID: "tx"}, ""},
		{"valid reserve", "", schema.AiUsageValue{Phase: "reserve", TransactionID: "tx", Model: &model, RequestType: &request}, ""},
		{"valid inherited commit", "", schema.AiUsageValue{Phase: "commit", TransactionID: "tx", RequestStatus: &status}, ""},
		{"reserve with vendor cost", "InvalidAiUsage", schema.AiUsageValue{Phase: "reserve", TransactionID: "tx", Model: &model, RequestType: &request, VendorCost: &cost}, ""},
		{"commit with vendor cost", "", schema.AiUsageValue{Phase: "commit", TransactionID: "tx", RequestStatus: &status, VendorCost: &cost}, ""},
		{"release with vendor cost", "InvalidAiUsage", schema.AiUsageValue{Phase: "commit", TransactionID: "tx", RequestStatus: &notSent, VendorCost: &cost}, ""},
		{"release without vendor cost", "", schema.AiUsageValue{Phase: "commit", TransactionID: "tx", RequestStatus: &notSent}, ""},
		{"vendor cost beyond twelve decimals", "InvalidAiUsage", schema.AiUsageValue{Phase: "commit", TransactionID: "tx", RequestStatus: &status, VendorCost: &tooPrecise}, ""},
		{"negative vendor cost", "InvalidAiUsage", schema.AiUsageValue{Phase: "commit", TransactionID: "tx", RequestStatus: &status, VendorCost: &negative}, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := validateAI(&Command{AI: &tc.value, Behavior: tc.behavior}, DefaultReservationMaxTTL)
			if tc.code == "" {
				if err != nil {
					t.Fatal(err)
				}
				return
			}
			var problem *apierrors.Error
			if !errors.As(err, &problem) || problem.Code != "ReportEntitlementUsageMetric."+tc.code {
				t.Fatalf("error=%v, want %s", err, tc.code)
			}
		})
	}
}

type countingUnauthorizedReader struct {
	calls  []db.AIUnauthorizedRecordedTodayParams
	answer bool
}

func (r *countingUnauthorizedReader) AIUnauthorizedRecordedToday(_ context.Context, arg db.AIUnauthorizedRecordedTodayParams) (bool, error) {
	r.calls = append(r.calls, arg)
	return r.answer, nil
}

// The lookup runs under the pair's lock on the hot path. Only a commit that
// resolves no rule can emit the event it deduplicates, so only that commit
// may pay for it.
func TestUnauthorizedLookupRunsOnlyForACommitWithoutARule(t *testing.T) {
	rate := decimal.NewFromInt(1)
	active := &aicredit.Model{ID: uuid.New(), Status: aicredit.Active}
	archived := &aicredit.Model{ID: active.ID, Status: aicredit.Archived}
	other := uuid.New()
	wildcard := []aicredit.Rule{{ID: uuid.New(), Active: true, Rates: aicredit.Rates{Request: &rate}, ChargeOnError: aicredit.Never}}
	elsewhere := []aicredit.Rule{{ID: uuid.New(), ModelID: &other, Active: true, Rates: aicredit.Rates{Request: &rate}, ChargeOnError: aicredit.Never}}
	now := time.Date(2026, 11, 11, 15, 4, 5, 0, time.UTC)
	for _, tc := range []struct {
		name, phase string
		model       *aicredit.Model
		rules       []aicredit.Rule
		lookups     int
	}{
		{"authorized commit", "commit", active, wildcard, 0},
		{"authorized reserve", "reserve", active, wildcard, 0},
		{"refused reserve", "reserve", nil, wildcard, 0},
		{"commit, unknown model", "commit", nil, wildcard, 1},
		{"commit, archived model", "commit", archived, wildcard, 1},
		{"commit, no rule for the model", "commit", active, elsewhere, 1},
		{"commit, no rule at all", "commit", active, nil, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reader := &countingUnauthorizedReader{answer: true}
			st := &State{OrganizationID: uuid.New(), Pair: &UsageContext{InstanceID: uuid.New(), EntitlementID: uuid.New()}, Now: now, AIModel: tc.model, AIModelRef: "as-sent", AIRequestType: aicredit.Completion, AIRules: tc.rules}
			if err := loadUnauthorizedAlready(t.Context(), reader, st, tc.phase); err != nil {
				t.Fatal(err)
			}
			if len(reader.calls) != tc.lookups {
				t.Fatalf("lookups=%d, want %d", len(reader.calls), tc.lookups)
			}
			if st.UnauthorizedAlready != (tc.lookups == 1) {
				t.Fatalf("UnauthorizedAlready=%v with %d lookups", st.UnauthorizedAlready, tc.lookups)
			}
			if tc.lookups == 0 {
				return
			}
			call := reader.calls[0]
			day := time.Date(2026, 11, 11, 0, 0, 0, 0, time.UTC)
			if call.OrganizationID != st.OrganizationID || call.InstanceID != st.Pair.InstanceID || call.EntitlementID != st.Pair.EntitlementID || call.ModelRef != "as-sent" || call.RequestType != db.AiRequestTypeCOMPLETION || !call.DayStart.Time.Equal(day) || !call.DayEnd.Time.Equal(day.AddDate(0, 0, 1)) {
				t.Fatalf("unexpected lookup: %+v", call)
			}
		})
	}
}
