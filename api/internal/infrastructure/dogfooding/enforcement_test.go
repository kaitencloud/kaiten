package dogfooding_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestClassifyEnforcementError_NilIsAllowed(t *testing.T) {
	got := dogfooding.ClassifyEnforcementError(nil)

	if got != dogfooding.EnforcementAllowed {
		t.Fatalf("ClassifyEnforcementError(nil) = %v, want EnforcementAllowed", got)
	}
}

func TestClassifyEnforcementError_DirectThresholdIsRejected(t *testing.T) {
	got := dogfooding.ClassifyEnforcementError(dogfooding.ErrThresholdExceeded)

	if got != dogfooding.EnforcementRejected {
		t.Fatalf("ClassifyEnforcementError(ErrThresholdExceeded) = %v, want EnforcementRejected", got)
	}
}

func TestClassifyEnforcementError_WrappedThresholdIsRejected(t *testing.T) {
	wrapped := fmt.Errorf("enforce %q limit: %w", "customers", dogfooding.ErrThresholdExceeded)

	got := dogfooding.ClassifyEnforcementError(wrapped)

	if got != dogfooding.EnforcementRejected {
		t.Fatalf("ClassifyEnforcementError(wrapped) = %v, want EnforcementRejected", got)
	}
}

func TestClassifyEnforcementError_DoublyWrappedThresholdIsRejected(t *testing.T) {
	wrapped := fmt.Errorf("outer: %w", fmt.Errorf("inner: %w", dogfooding.ErrThresholdExceeded))

	got := dogfooding.ClassifyEnforcementError(wrapped)

	if got != dogfooding.EnforcementRejected {
		t.Fatalf("ClassifyEnforcementError(doubly wrapped) = %v, want EnforcementRejected", got)
	}
}

func TestClassifyEnforcementError_PlainErrorIsUnavailable(t *testing.T) {
	got := dogfooding.ClassifyEnforcementError(errors.New("dial tcp: connection refused"))

	if got != dogfooding.EnforcementUnavailable {
		t.Fatalf("ClassifyEnforcementError(transient) = %v, want EnforcementUnavailable", got)
	}
}

func TestClassifyEnforcementError_WrappedNonThresholdErrorIsUnavailable(t *testing.T) {
	wrapped := fmt.Errorf("report %q usage: %w", "customers", errors.New("timeout"))

	got := dogfooding.ClassifyEnforcementError(wrapped)

	if got != dogfooding.EnforcementUnavailable {
		t.Fatalf("ClassifyEnforcementError(wrapped transient) = %v, want EnforcementUnavailable", got)
	}
}

func TestClassifyEnforcementError_UnrelatedSentinelDoesNotMatchThreshold(t *testing.T) {
	unrelated := errors.New("entitlement threshold exceeded") // same message, different identity

	got := dogfooding.ClassifyEnforcementError(unrelated)

	if got != dogfooding.EnforcementUnavailable {
		t.Fatalf("ClassifyEnforcementError(look-alike message) = %v, want EnforcementUnavailable (errors.Is must use identity, not message)", got)
	}
}

// fakeUsageReporter is a minimal services.UsageReporter test double for
// exercising EnforceCreationLimit and CompensateEnforcement directly,
// independent of any single create* package's own richer double.
type fakeUsageReporter struct {
	reportErr error

	decrementCalls int
	decrementOrgID uuid.UUID
	decrementSlug  string
	decrementErr   error
}

var _ services.UsageReporter = (*fakeUsageReporter)(nil)

func (r *fakeUsageReporter) TrackAsync(uuid.UUID, string) {}

func (r *fakeUsageReporter) DecrementAsync(uuid.UUID, string) {}

func (r *fakeUsageReporter) ReportAndEnforce(context.Context, uuid.UUID, string) error {
	return r.reportErr
}

func (r *fakeUsageReporter) Decrement(_ context.Context, orgID uuid.UUID, slug string) error {
	r.decrementCalls++
	r.decrementOrgID = orgID
	r.decrementSlug = slug
	return r.decrementErr
}

// The dogfooding-disabled path: wiring hands every caller a
// services.NoopUsageReporter rather than nil, so the whole enforcement dance
// runs and allows without anything being reported.
func TestEnforceCreationLimit_NoopReporterAllows(t *testing.T) {
	incremented, err := dogfooding.EnforceCreationLimit(t.Context(), services.NoopUsageReporter{}, uuid.New(), "slug", "Code", "message", nil)
	if err != nil {
		t.Fatalf("EnforceCreationLimit() error = %v, want nil", err)
	}
	if !incremented {
		t.Fatalf("EnforceCreationLimit() incremented = false, want true — a no-op ReportAndEnforce succeeds")
	}
}

func TestEnforceCreationLimit_AllowedIncrementsAndReturnsNoError(t *testing.T) {
	reporter := &fakeUsageReporter{}

	incremented, err := dogfooding.EnforceCreationLimit(t.Context(), reporter, uuid.New(), "slug", "Code", "message", nil)
	if err != nil {
		t.Fatalf("EnforceCreationLimit() error = %v, want nil", err)
	}
	if !incremented {
		t.Fatalf("EnforceCreationLimit() incremented = false, want true when ReportAndEnforce succeeds")
	}
}

func TestEnforceCreationLimit_RejectedReturnsConflictAndRunsOnRejected(t *testing.T) {
	reporter := &fakeUsageReporter{reportErr: dogfooding.ErrThresholdExceeded}
	var onRejectedCalls int

	incremented, err := dogfooding.EnforceCreationLimit(t.Context(), reporter, uuid.New(), "slug",
		"CreateThing.EntitlementLimitReached", "Thing creation limit reached for this organization",
		func() { onRejectedCalls++ })

	if incremented {
		t.Fatalf("EnforceCreationLimit() incremented = true, want false on rejection")
	}
	var apiErr *kaitenerrors.Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("EnforceCreationLimit() error = %v, want *apierrors.Error", err)
	}
	if apiErr.Code != "CreateThing.EntitlementLimitReached" {
		t.Fatalf("EnforceCreationLimit() error code = %q, want %q", apiErr.Code, "CreateThing.EntitlementLimitReached")
	}
	if onRejectedCalls != 1 {
		t.Fatalf("onRejected called %d times, want exactly 1", onRejectedCalls)
	}
}

func TestEnforceCreationLimit_RejectedWithNilOnRejectedDoesNotPanic(t *testing.T) {
	reporter := &fakeUsageReporter{reportErr: dogfooding.ErrThresholdExceeded}

	_, err := dogfooding.EnforceCreationLimit(t.Context(), reporter, uuid.New(), "slug", "Code", "message", nil)

	if err == nil {
		t.Fatalf("EnforceCreationLimit() error = nil, want a conflict error on rejection")
	}
}

// The hard requirement: an entitlement limit that could not be verified must
// refuse the create, not wave it through. Kaiten is the billing authority for
// the fleets reporting to it, and nothing is incremented on this path -- so a
// create allowed here is a resource sold that no later reconciliation can find.
func TestEnforceCreationLimit_UnavailableFailsClosedWithoutRunningOnRejected(t *testing.T) {
	reporter := &fakeUsageReporter{reportErr: errors.New("dial tcp: connection refused")}
	var onRejectedCalls int

	incremented, err := dogfooding.EnforceCreationLimit(t.Context(), reporter, uuid.New(), "slug", "Code", "message",
		func() { onRejectedCalls++ })

	if err == nil {
		t.Fatalf("EnforceCreationLimit() error = nil, want a refusal (fail closed when the limit is unverifiable)")
	}
	if incremented {
		t.Fatalf("EnforceCreationLimit() incremented = true, want false when nothing was reported")
	}
	if onRejectedCalls != 0 {
		t.Fatalf("onRejected called %d times, want 0 — nothing was rejected, so a rejection event would be a false record", onRejectedCalls)
	}
}

// 503, not the 409 an over-limit gets: "you are over your limit" is terminal
// and needs an upgrade, "we could not check" is retryable. A client that
// cannot tell them apart either retries what will never succeed or gives up on
// what would have.
func TestEnforceCreationLimit_UnavailableIsRetryable503NotConflict(t *testing.T) {
	reporter := &fakeUsageReporter{reportErr: errors.New("dial tcp: connection refused")}

	_, err := dogfooding.EnforceCreationLimit(t.Context(), reporter, uuid.New(), "slug",
		"CreateThing.EntitlementLimitReached", "Thing creation limit reached for this organization", nil)

	var apiErr *kaitenerrors.Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("EnforceCreationLimit() error = %v, want *apierrors.Error", err)
	}
	if apiErr.HTTPStatus() != http.StatusServiceUnavailable {
		t.Fatalf("EnforceCreationLimit() status = %d, want %d", apiErr.HTTPStatus(), http.StatusServiceUnavailable)
	}
	if apiErr.Code != dogfooding.VerificationUnavailableCode {
		t.Fatalf("EnforceCreationLimit() error code = %q, want %q — not the caller's over-limit code, which would tell the client to buy more of something it may already have room for",
			apiErr.Code, dogfooding.VerificationUnavailableCode)
	}
}

// The regression guard for "OSS is unaffected". A deployment that does not
// report reaches enforcement through services.NoopUsageReporter, whose
// ReportAndEnforce returns nil -- so it classifies as allowed and can never
// reach the refusal above. This is why failing closed needed no SaaS/OSS
// conditional; if this test ever fails, that claim has stopped being true.
func TestEnforceCreationLimit_NoopReporterCannotReachTheUnavailableRefusal(t *testing.T) {
	for _, slug := range []string{"customers", "instances", ""} {
		incremented, err := dogfooding.EnforceCreationLimit(t.Context(), services.NoopUsageReporter{},
			uuid.New(), slug, "Code", "message", func() {
				t.Fatalf("onRejected ran for a no-op reporter")
			})
		if err != nil {
			t.Fatalf("EnforceCreationLimit(slug=%q) error = %v, want nil — reporting is off, so nothing can be unverifiable", slug, err)
		}
		if !incremented {
			t.Fatalf("EnforceCreationLimit(slug=%q) incremented = false, want true", slug)
		}
	}
}

func TestCompensateEnforcement_DecrementsWhenIncremented(t *testing.T) {
	reporter := &fakeUsageReporter{}
	orgID := uuid.New()

	dogfooding.CompensateEnforcement(t.Context(), reporter, true, orgID, "slug")

	if reporter.decrementCalls != 1 {
		t.Fatalf("Decrement called %d times, want 1", reporter.decrementCalls)
	}
	if reporter.decrementOrgID != orgID || reporter.decrementSlug != "slug" {
		t.Fatalf("Decrement called with (%v, %q), want (%v, %q)", reporter.decrementOrgID, reporter.decrementSlug, orgID, "slug")
	}
}

func TestCompensateEnforcement_NoopWhenNotIncremented(t *testing.T) {
	reporter := &fakeUsageReporter{}

	dogfooding.CompensateEnforcement(t.Context(), reporter, false, uuid.New(), "slug")

	if reporter.decrementCalls != 0 {
		t.Fatalf("Decrement called %d times, want 0 when nothing was incremented", reporter.decrementCalls)
	}
}

func TestCompensateEnforcement_NoopReporterDoesNotPanic(t *testing.T) {
	dogfooding.CompensateEnforcement(t.Context(), services.NoopUsageReporter{}, true, uuid.New(), "slug")
}

func TestCompensateEnforcement_FailedDecrementIsLoggedNotPanicked(t *testing.T) {
	reporter := &fakeUsageReporter{decrementErr: errors.New("remote unavailable")}

	dogfooding.CompensateEnforcement(t.Context(), reporter, true, uuid.New(), "slug")

	if reporter.decrementCalls != 1 {
		t.Fatalf("Decrement called %d times, want 1", reporter.decrementCalls)
	}
}

func TestEnforceAndPersist_AllowedAndPersistSucceeds_ReturnsResultWithoutCompensating(t *testing.T) {
	reporter := &fakeUsageReporter{}
	want := "created"

	got, err := dogfooding.EnforceAndPersist(t.Context(), reporter, uuid.New(), "slug", "Code", "message", nil,
		func(context.Context) (string, error) { return want, nil })
	if err != nil {
		t.Fatalf("EnforceAndPersist() error = %v, want nil", err)
	}
	if got != want {
		t.Fatalf("EnforceAndPersist() = %q, want %q", got, want)
	}
	if reporter.decrementCalls != 0 {
		t.Fatalf("Decrement called %d times, want 0 when persist succeeds", reporter.decrementCalls)
	}
}

func TestEnforceAndPersist_AllowedAndPersistFails_CompensatesAndReturnsPersistError(t *testing.T) {
	reporter := &fakeUsageReporter{}
	orgID := uuid.New()
	persistErr := errors.New("db write failed")

	_, err := dogfooding.EnforceAndPersist(t.Context(), reporter, orgID, "slug", "Code", "message", nil,
		func(context.Context) (string, error) { return "", persistErr })

	if !errors.Is(err, persistErr) {
		t.Fatalf("EnforceAndPersist() error = %v, want %v", err, persistErr)
	}
	if reporter.decrementCalls != 1 {
		t.Fatalf("Decrement called %d times, want 1", reporter.decrementCalls)
	}
	if reporter.decrementOrgID != orgID || reporter.decrementSlug != "slug" {
		t.Fatalf("Decrement called with (%v, %q), want (%v, %q)", reporter.decrementOrgID, reporter.decrementSlug, orgID, "slug")
	}
}

func TestEnforceAndPersist_Rejected_NeverCallsPersistAndRunsOnRejected(t *testing.T) {
	reporter := &fakeUsageReporter{reportErr: dogfooding.ErrThresholdExceeded}
	persistCalled := false
	onRejectedCalls := 0

	_, err := dogfooding.EnforceAndPersist(t.Context(), reporter, uuid.New(), "slug",
		"CreateThing.EntitlementLimitReached", "Thing creation limit reached for this organization",
		func() { onRejectedCalls++ },
		func(context.Context) (string, error) {
			persistCalled = true
			return "", nil
		})

	if err == nil {
		t.Fatalf("EnforceAndPersist() error = nil, want a conflict error on rejection")
	}
	if persistCalled {
		t.Fatalf("persist was called after a rejected enforcement, want no persistence attempt")
	}
	if onRejectedCalls != 1 {
		t.Fatalf("onRejected called %d times, want exactly 1", onRejectedCalls)
	}
	if reporter.decrementCalls != 0 {
		t.Fatalf("Decrement called %d times, want 0 (nothing was incremented, so nothing to compensate)", reporter.decrementCalls)
	}
}

// The property a client's retry depends on: an unverifiable limit leaves the
// database untouched, so retrying cannot duplicate anything. persist must never
// run.
func TestEnforceAndPersist_Unavailable_NeverCallsPersistAndNeverCompensates(t *testing.T) {
	reporter := &fakeUsageReporter{reportErr: errors.New("dial tcp: connection refused")}
	persistCalled := false

	_, err := dogfooding.EnforceAndPersist(t.Context(), reporter, uuid.New(), "slug", "Code", "message", nil,
		func(context.Context) (string, error) {
			persistCalled = true
			return "created", nil
		})

	if err == nil {
		t.Fatalf("EnforceAndPersist() error = nil, want a refusal when the limit is unverifiable")
	}
	if persistCalled {
		t.Fatalf("persist was called with an unverifiable limit — the row would exist unmetered, which is the defect this change removes")
	}
	if reporter.decrementCalls != 0 {
		t.Fatalf("Decrement called %d times, want 0 (nothing was incremented, so nothing to compensate)", reporter.decrementCalls)
	}
}

func TestEnforceAndPersist_NoopReporter_PersistsAndPropagatesPersistError(t *testing.T) {
	persistErr := errors.New("db write failed")

	_, err := dogfooding.EnforceAndPersist(t.Context(), services.NoopUsageReporter{}, uuid.New(), "slug", "Code", "message", nil,
		func(context.Context) (string, error) { return "", persistErr })

	if !errors.Is(err, persistErr) {
		t.Fatalf("EnforceAndPersist() error = %v, want %v", err, persistErr)
	}
}
