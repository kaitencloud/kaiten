package createinstance

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
)

// compensationQuotaReporter is a package-internal usage-reporter test double,
// separate from handler_test.go's quotaUsageReporter (package
// createinstance_test), because these tests need to call the unexported
// enforceAndPersist directly to force a persistence failure without a real
// transaction -- see enforceAndPersist's doc comment.
type compensationQuotaReporter struct {
	reportErr error

	decrementCalls int
	decrementOrgID uuid.UUID
	decrementSlug  string
	decrementErr   error
}

func (r *compensationQuotaReporter) TrackAsync(uuid.UUID, string) {}

func (r *compensationQuotaReporter) DecrementAsync(uuid.UUID, string) {}

func (r *compensationQuotaReporter) ReportAndEnforce(context.Context, uuid.UUID, string) error {
	return r.reportErr
}

func (r *compensationQuotaReporter) Decrement(_ context.Context, orgID uuid.UUID, entitlementSlug string) error {
	r.decrementCalls++
	r.decrementOrgID = orgID
	r.decrementSlug = entitlementSlug
	return r.decrementErr
}

func failingPersist(persistErr error) func(context.Context) (*schema.Instance, error) {
	return func(context.Context) (*schema.Instance, error) {
		return nil, persistErr
	}
}

func TestEnforceAndPersist_CompensatesWhenPersistFailsAfterSuccessfulEnforcement(t *testing.T) {
	reporter := &compensationQuotaReporter{}
	uc := &UseCase{deps: Deps{UsageReporter: reporter}}

	orgID := uuid.New()
	persistErr := errors.New("db write failed")

	_, err := uc.enforceAndPersist(t.Context(), orgID, failingPersist(persistErr))

	if !errors.Is(err, persistErr) {
		t.Fatalf("enforceAndPersist() error = %v, want %v", err, persistErr)
	}
	if reporter.decrementCalls != 1 {
		t.Fatalf("Decrement calls = %d, want 1", reporter.decrementCalls)
	}
	if reporter.decrementOrgID != orgID {
		t.Fatalf("Decrement orgID = %v, want %v", reporter.decrementOrgID, orgID)
	}
	if reporter.decrementSlug != dogfooding.InstanceEntitlementSlug {
		t.Fatalf("Decrement slug = %q, want %q", reporter.decrementSlug, dogfooding.InstanceEntitlementSlug)
	}
}

func TestEnforceAndPersist_NoCompensationWhenPersistSucceeds(t *testing.T) {
	reporter := &compensationQuotaReporter{}
	uc := &UseCase{deps: Deps{UsageReporter: reporter}}

	want := &schema.Instance{Name: "prod-1"}

	got, err := uc.enforceAndPersist(t.Context(), uuid.New(), func(context.Context) (*schema.Instance, error) {
		return want, nil
	})
	if err != nil {
		t.Fatalf("enforceAndPersist() error = %v, want nil", err)
	}
	if got != want {
		t.Fatalf("enforceAndPersist() instance = %v, want %v", got, want)
	}
	if reporter.decrementCalls != 0 {
		t.Fatalf("Decrement calls = %d, want 0", reporter.decrementCalls)
	}
}

// The other way enforcement can decline to increment: a transient reporting
// failure refuses, so the increment and the persist are both absent and there is
// nothing to compensate.
func TestEnforceAndPersist_UnavailableNeverPersistsOrCompensates(t *testing.T) {
	reporter := &compensationQuotaReporter{reportErr: errors.New("dogfooding unavailable")}
	uc := &UseCase{deps: Deps{UsageReporter: reporter}}

	persistCalled := false
	_, err := uc.enforceAndPersist(t.Context(), uuid.New(), func(context.Context) (*schema.Instance, error) {
		persistCalled = true
		return nil, nil
	})

	if err == nil {
		t.Fatal("enforceAndPersist() error = nil, want a refusal when the limit cannot be verified")
	}
	if persistCalled {
		t.Fatal("persist was called with an unverifiable limit, want no persistence attempt -- the row would exist unmetered")
	}
	if reporter.decrementCalls != 0 {
		t.Fatalf("Decrement calls = %d, want 0 (nothing was incremented, so nothing should be decremented)", reporter.decrementCalls)
	}
}

func TestEnforceAndPersist_RejectedNeverPersistsOrCompensates(t *testing.T) {
	reporter := &compensationQuotaReporter{
		reportErr: fmt.Errorf("report instance usage: %w", dogfooding.ErrThresholdExceeded),
	}

	uc := &UseCase{deps: Deps{UsageReporter: reporter}}

	persistCalled := false
	_, err := uc.enforceAndPersist(t.Context(), uuid.New(), func(context.Context) (*schema.Instance, error) {
		persistCalled = true
		return nil, nil
	})

	if err == nil {
		t.Fatal("enforceAndPersist() error = nil, want conflict")
	}
	if persistCalled {
		t.Fatal("persist was called after a rejected enforcement, want no persistence attempt")
	}
	if reporter.decrementCalls != 0 {
		t.Fatalf("Decrement calls = %d, want 0", reporter.decrementCalls)
	}
}

func TestEnforceAndPersist_CompensationFailureIsLoggedNotPropagated(t *testing.T) {
	reporter := &compensationQuotaReporter{decrementErr: errors.New("decrement also unavailable")}
	uc := &UseCase{deps: Deps{UsageReporter: reporter}}

	persistErr := errors.New("db write failed")

	_, err := uc.enforceAndPersist(t.Context(), uuid.New(), failingPersist(persistErr))

	// The original persistence error must still be returned, unchanged, even
	// though the compensating Decrement itself failed -- compensation is
	// best-effort, not a second guaranteed-atomic operation.
	if !errors.Is(err, persistErr) {
		t.Fatalf("enforceAndPersist() error = %v, want %v", err, persistErr)
	}
	if reporter.decrementCalls != 1 {
		t.Fatalf("Decrement calls = %d, want 1", reporter.decrementCalls)
	}
}
