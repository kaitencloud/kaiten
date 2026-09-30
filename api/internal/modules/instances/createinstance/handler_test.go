package createinstance_test

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type quotaUsageReporter struct {
	err   error
	calls int
}

func (r *quotaUsageReporter) TrackAsync(uuid.UUID, string) {}

func (r *quotaUsageReporter) DecrementAsync(uuid.UUID, string) {}

func (r *quotaUsageReporter) ReportAndEnforce(context.Context, uuid.UUID, string) error {
	r.calls++
	return r.err
}

func (r *quotaUsageReporter) Decrement(context.Context, uuid.UUID, string) error {
	return nil
}

func TestEnforceCreationLimit_AllowsSuccessfulReport(t *testing.T) {
	reporter := &quotaUsageReporter{}
	uc := createinstance.NewUseCase(createinstance.Deps{UsageReporter: reporter})

	err := uc.EnforceCreationLimit(t.Context(), uuid.New())
	if err != nil {
		t.Fatalf("EnforceCreationLimit() error = %v", err)
	}
	if reporter.calls != 1 {
		t.Fatalf("ReportAndEnforce calls = %d, want 1", reporter.calls)
	}
}

// Unlike customers, there is no InstanceCreationRejected event to record --
// none exists today for either the direct-create or the upsertintegration
// path, so there's no divergence to fix on this side. The reject case is
// therefore a plain, DB-free unit test.
func TestEnforceCreationLimit_ReturnsConflictForWrappedThreshold(t *testing.T) {
	reporter := &quotaUsageReporter{
		err: fmt.Errorf("report instance usage: %w", dogfooding.ErrThresholdExceeded),
	}
	uc := createinstance.NewUseCase(createinstance.Deps{UsageReporter: reporter})

	err := uc.EnforceCreationLimit(t.Context(), uuid.New())

	if !kaitenerrors.IsConflict(err) {
		t.Fatalf("expected conflict, got %v", err)
	}
	if got := kaitenerrors.GetCode(err); got != "CreateInstance.EntitlementLimitReached" {
		t.Fatalf("error code = %q", got)
	}
}

// Sits directly beside the threshold case above, and the pair is the point: two
// refusals that must not look alike to a client. That one is terminal and wants
// an upgrade; this one is retryable and wants a retry.
func TestEnforceCreationLimit_FailsClosedForUnverifiableLimit(t *testing.T) {
	reporter := &quotaUsageReporter{err: errors.New("dogfooding unavailable")}
	uc := createinstance.NewUseCase(createinstance.Deps{UsageReporter: reporter})

	err := uc.EnforceCreationLimit(t.Context(), uuid.New())

	if err == nil {
		t.Fatalf("EnforceCreationLimit() error = nil, want a refusal when the limit cannot be verified")
	}
	if !kaitenerrors.IsUnavailable(err) {
		t.Fatalf("EnforceCreationLimit() error = %v, want a 503 Unavailable, not a conflict", err)
	}
	if got := kaitenerrors.GetCode(err); got != dogfooding.VerificationUnavailableCode {
		t.Fatalf("error code = %q, want %q", got, dogfooding.VerificationUnavailableCode)
	}
}

// Dogfooding disabled: wiring supplies a no-op reporter, never nil.
//
// Also the guard that failing closed above left OSS alone: a no-op reporter
// returns nil, classifies as allowed, and cannot reach the refusal.
func TestEnforceCreationLimit_NoopReporterAllows(t *testing.T) {
	uc := createinstance.NewUseCase(createinstance.Deps{UsageReporter: services.NoopUsageReporter{}})

	err := uc.EnforceCreationLimit(t.Context(), uuid.New())
	if err != nil {
		t.Fatalf("EnforceCreationLimit() error = %v, want nil", err)
	}
}
