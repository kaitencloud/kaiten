package aiusage_test

import (
	"errors"
	"net/http"
	"testing"

	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestZeroPolicyDenies(t *testing.T) {
	var policy aiusage.Policy
	var problem *apierrors.Error
	if !errors.As(policy.RequireEnabled(), &problem) {
		t.Fatal("zero policy must return an API problem")
	}
	if problem.HTTPStatus() != http.StatusForbidden || problem.ErrorCode() != "AIUsage.Disabled" {
		t.Fatalf("problem = %d %q, want 403 AIUsage.Disabled", problem.HTTPStatus(), problem.ErrorCode())
	}
}

func TestPolicyRequiresExplicitEnablement(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		policy := aiusage.Policy{Enabled: enabled}
		err := policy.RequireEnabled()
		if enabled && err != nil {
			t.Fatalf("explicit enablement refused: %v", err)
		}
		if !enabled && !apierrors.IsForbidden(err) {
			t.Fatalf("disabled policy must refuse, got %v", err)
		}
	}
}
