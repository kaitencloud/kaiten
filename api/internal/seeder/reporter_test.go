package seeder

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
)

// stubUsageReporter returns whatever ReportAndEnforce was told to return and
// counts the calls. It embeds NoopUsageReporter so the async half of the
// interface needs no stubbing here -- NonEnforcing does not wrap it.
type stubUsageReporter struct {
	services.NoopUsageReporter

	reportErr   error
	reportCalls int
}

func (s *stubUsageReporter) ReportAndEnforce(context.Context, uuid.UUID, string) error {
	s.reportCalls++
	return s.reportErr
}

// TestNonEnforcing_AbsorbsEveryOutcome is the reason this wrapper exists at all.
//
// Both refusals the serving API now makes -- a reached limit, and a limit that
// could not be verified -- would abort a seeding profile partway through, leaving
// a half-populated deployment. An operator populating their own database is not a
// tenant consuming what they bought, so neither refusal applies to them; but the
// underlying report is still attempted, which is what keeps the meters truthful.
func TestNonEnforcing_AbsorbsEveryOutcome(t *testing.T) {
	tests := []struct {
		name      string
		reportErr error
	}{
		{name: "a successful report"},
		{
			name:      "a reached threshold",
			reportErr: fmt.Errorf("enforce %q limit: %w", "customers", dogfooding.ErrThresholdExceeded),
		},
		{
			// Post-fail-closed this is what the serving API turns into a 503.
			// Propagating it here would end a seed at the first network blip.
			name:      "an unverifiable limit",
			reportErr: errors.New("dial tcp: connection refused"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stub := &stubUsageReporter{reportErr: tt.reportErr}

			err := NonEnforcing(stub).ReportAndEnforce(t.Context(), uuid.New(), "customers")
			if err != nil {
				t.Fatalf("ReportAndEnforce() error = %v, want nil (the seeder never blocks on a meter)", err)
			}
			if stub.reportCalls != 1 {
				t.Fatalf("underlying ReportAndEnforce called %d times, want 1 — swallowing the error must not mean skipping the report", stub.reportCalls)
			}
		})
	}
}

// TestNonEnforcing_NilReporterIsUsable guards the constructor's one branch: a
// driver that seeds with dogfooding off passes nil, and must still get something
// callable rather than a wrapper around a nil interface.
func TestNonEnforcing_NilReporterIsUsable(t *testing.T) {
	if err := NonEnforcing(nil).ReportAndEnforce(t.Context(), uuid.New(), "customers"); err != nil {
		t.Fatalf("ReportAndEnforce() on a nil-wrapped reporter error = %v, want nil", err)
	}
}
