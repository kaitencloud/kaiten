package reportentitlementusagemetric

import (
	"errors"
	"testing"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestValidateAI(t *testing.T) {
	model, request, status := "model", aicredit.Completion, aicredit.Success
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
