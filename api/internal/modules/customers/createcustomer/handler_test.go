package createcustomer_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
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

// The threshold-exceeded case, which also has to record a rejection event,
// needs a real transaction and is covered end to end by the black-box
// regression test in tests/integrations/customers/upsertintegration_test.go
// instead -- that's also the one place proving the event this package's
// direct-create path and upsertintegration's composed create path now share
// the exact same rejection behavior, which is the actual bug this method
// exists to fix.

func TestEnforceCreationLimit_AllowsSuccessfulReport(t *testing.T) {
	reporter := &quotaUsageReporter{}
	uc := createcustomer.NewUseCase(createcustomer.Deps{UsageReporter: reporter})

	err := uc.EnforceCreationLimit(t.Context(), uuid.New(), "acme", "Acme")
	if err != nil {
		t.Fatalf("EnforceCreationLimit() error = %v", err)
	}
	if reporter.calls != 1 {
		t.Fatalf("ReportAndEnforce calls = %d, want 1", reporter.calls)
	}
}

// Customers are the metered resource this deployment sells, so a customer
// created while its limit could not be read is one sold on credit nobody
// recorded: nothing was incremented, so no later reconciliation finds it.
// Refusing is the only outcome that keeps the meter and the database agreeing.
func TestEnforceCreationLimit_FailsClosedForUnverifiableLimit(t *testing.T) {
	reporter := &quotaUsageReporter{err: errors.New("dogfooding unavailable")}
	uc := createcustomer.NewUseCase(createcustomer.Deps{UsageReporter: reporter})

	err := uc.EnforceCreationLimit(t.Context(), uuid.New(), "acme", "Acme")

	if err == nil {
		t.Fatalf("EnforceCreationLimit() error = nil, want a refusal when the limit cannot be verified")
	}
	// 503 rather than the 409 an over-limit gets, and not this package's own
	// EntitlementLimitReachedCode: the caller may well have room, so telling
	// them to buy more would be wrong. Retrying is the correct remedy, and it
	// is safe because nothing was incremented.
	if !kaitenerrors.IsUnavailable(err) {
		t.Fatalf("EnforceCreationLimit() error = %v, want a 503 Unavailable", err)
	}
	if got := kaitenerrors.GetCode(err); got != dogfooding.VerificationUnavailableCode {
		t.Fatalf("error code = %q, want %q", got, dogfooding.VerificationUnavailableCode)
	}
}

// Dogfooding disabled: wiring supplies a no-op reporter, never nil.
//
// This is also the guard that failing closed above did not change OSS. A no-op
// reporter returns nil, which classifies as allowed, so it can never reach the
// refusal -- which is why that change needed no deployment-flavour switch.
func TestEnforceCreationLimit_NoopReporterAllows(t *testing.T) {
	uc := createcustomer.NewUseCase(createcustomer.Deps{UsageReporter: services.NoopUsageReporter{}})

	err := uc.EnforceCreationLimit(t.Context(), uuid.New(), "acme", "Acme")
	if err != nil {
		t.Fatalf("EnforceCreationLimit() error = %v, want nil", err)
	}
}
