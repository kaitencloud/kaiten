package reportentitlementusagemetric

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestRefuseWrongRoute(t *testing.T) {
	stigg := "stigg"
	tests := []struct {
		name     string
		scope    db.EntitlementLimitScope
		key      *string
		wantCode string
	}{
		{"an entitlement's own route, per instance", db.EntitlementLimitScopeINSTANCE, nil, ""},
		{"a resource's route, per resource", db.EntitlementLimitScopeRESOURCE, &stigg, ""},
		{"an entitlement's own route, per resource", db.EntitlementLimitScopeRESOURCE, nil, "ReportEntitlementUsageMetric.ResourceKeyRequired"},
		{"a resource's route, per instance", db.EntitlementLimitScopeINSTANCE, &stigg, "ReportEntitlementUsageMetric.ResourceKeyNotAllowed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := refuseWrongRoute(&UsageContext{EntitlementSlug: "sources", LimitScope: tt.scope, ResourceKey: tt.key})

			if tt.wantCode == "" {
				if err != nil {
					t.Fatalf("refuseWrongRoute() = %v, want nil", err)
				}
				return
			}
			if got := kaitenerrors.GetCode(err); got != tt.wantCode {
				t.Fatalf("refuseWrongRoute() code = %q, want %q (%v)", got, tt.wantCode, err)
			}
			if status := kaitenerrors.GetHTTPStatus(err); status != 422 {
				t.Errorf("refuseWrongRoute() status = %d, want 422", status)
			}
			var apiErr *kaitenerrors.Error
			if tt.key != nil && (!errors.As(err, &apiErr) || len(apiErr.Errors) != 1 || apiErr.Errors[0].Location != resourceKeyLocation) {
				t.Errorf("a resource named on the wrong route is pointed at: %#v", err)
			}
		})
	}
}

// The ceiling of resources is 10 000 unless the deployment says otherwise: a use
// case built with no setting, or one that is not a count, gets the default (the
// integration suite's server is built from a bare config, so this is the ceiling
// it runs under), and a setting is kept as it is.
func TestMaxResourcesFallsBackToItsDefault(t *testing.T) {
	tests := []struct {
		name string
		set  int
		want int
	}{
		// The number the ADR settles on, written out so that moving it is a decision.
		{"nothing set", 0, 10_000},
		{"a negative count", -3, 10_000},
		{"a count", 250, 250},
		{"one", 1, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NewUseCase(Deps{MaxResources: tt.set}).maxResources; got != tt.want {
				t.Fatalf("NewUseCase(Deps{MaxResources: %d}).maxResources = %d, want %d", tt.set, got, tt.want)
			}
		})
	}
}

// The four payloads gain the resource without moving what they carried: absent
// when there is none, spelled resourceKey when there is one.
func TestEventPayloadsCarryResourceKey(t *testing.T) {
	stigg := "stigg"
	payloads := map[string]func(*string) any{
		"accepted": func(key *string) any {
			return InstanceEntitlementUsageReportAccepted{EntitlementSlug: "sources", Value: 1, Behavior: BehaviorAppend, EventCount: 1, Status: events.UsageReportStatusAccepted, ResourceKey: key}
		},
		"cap exceeded": func(key *string) any {
			return InstanceEntitlementCapExceeded{EntitlementSlug: "sources", Threshold: 4, Value: 5, Overage: 1, ResourceKey: key}
		},
		"warning": func(key *string) any {
			return InstanceEntitlementUsageWarningThresholdReached{EntitlementSlug: "sources", Threshold: 4, Boundary: 3, Value: 3, ResourceKey: key}
		},
		"rolled over": func(key *string) any {
			return InstanceEntitlementUsagePeriodRolledOver{EntitlementSlug: "sources", Reason: usage.ReasonPeriodEnded, ResourceKey: key}
		},
	}
	for name, build := range payloads {
		t.Run(name, func(t *testing.T) {
			without, err := json.Marshal(build(nil))
			if err != nil {
				t.Fatal(err)
			}
			var decoded map[string]any
			if err := json.Unmarshal(without, &decoded); err != nil {
				t.Fatal(err)
			}
			if _, present := decoded["resourceKey"]; present {
				t.Errorf("an entitlement that counts per instance names no resource: %s", without)
			}

			with, err := json.Marshal(build(&stigg))
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(with, &decoded); err != nil {
				t.Fatal(err)
			}
			if decoded["resourceKey"] != "stigg" {
				t.Errorf("resourceKey = %v: %s", decoded["resourceKey"], with)
			}
		})
	}
}
