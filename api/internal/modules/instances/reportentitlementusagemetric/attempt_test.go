package reportentitlementusagemetric

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type targetTypeStub struct {
	kind  string
	err   error
	calls int
	org   uuid.UUID
	slug  string
}

func (s *targetTypeStub) EntitlementType(_ context.Context, org uuid.UUID, slug string) (string, error) {
	s.calls++
	s.org = org
	s.slug = slug
	return s.kind, s.err
}

func TestOrdinaryMetadataFailuresKeepAttemptAccountingOffAndOn(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		for _, target := range []struct {
			name, kind string
			err        error
		}{
			{"missing", "", pgx.ErrNoRows}, {"number", "NUMBER", nil}, {"unsupported boolean", "BOOLEAN", nil}, {"unsupported config", "CONFIG", nil},
		} {
			t.Run(target.name+map[bool]string{false: "/off", true: "/on"}[enabled], func(t *testing.T) {
				org := uuid.New()
				classifier := &targetTypeStub{kind: target.kind, err: target.err}
				reporter := &rolloutReporter{}
				u := NewUseCase(Deps{AIPolicy: aiusage.Policy{Flags: aitest.Flags(enabled)}, TargetClassifier: classifier, UserProvider: &currentuser.StaticUserProvider{UserID: uuid.New(), OrganizationID: org}, UsageReporter: reporter})
				// Real Execute unwinds before Transact. No database can be used,
				// and every ordinary attempt still counts despite metadata failure.
				_, err := u.Execute(t.Context(), "missing-instance", "target", &Command{Metadata: map[string]any{"unsupported": make(chan int)}})
				require.Error(t, err)
				require.Equal(t, 1, reporter.writes)
				if enabled {
					require.Zero(t, classifier.calls)
				} else {
					require.Equal(t, org, classifier.org)
					require.Equal(t, "target", classifier.slug)
					require.Equal(t, 1, classifier.calls)
				}
			})
		}
	}
}

func TestClassifiedOrdinaryLoadAndClockFailuresKeepDeferredAttempt(t *testing.T) {
	for _, scenario := range []struct {
		name, kind      string
		lookup, outcome error
	}{
		{"missing target", "", pgx.ErrNoRows, apierrors.NotFound("missing", "missing")},
		{"ungranted number", "NUMBER", nil, apierrors.NotFound("ungranted", "ungranted")},
		{"unsupported boolean", "BOOLEAN", nil, apierrors.Validation("unsupported", "unsupported")},
		{"unsupported config", "CONFIG", nil, apierrors.Validation("unsupported", "unsupported")},
		{"LockPair error", "NUMBER", nil, errors.New("lock failed")},
		{"clock error", "NUMBER", nil, errors.New("clock failed")},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			reporter := &rolloutReporter{}
			u := NewUseCase(Deps{TargetClassifier: &targetTypeStub{kind: scenario.kind, err: scenario.lookup}, UsageReporter: reporter})
			eligible, err := u.ordinaryAttempt(t.Context(), uuid.New(), "target")
			require.NoError(t, err)
			require.True(t, eligible, "arm before metadata/LockPair/current-grant validation")
			require.Zero(t, reporter.writes, "classification does not submit under a pair lock")
			u.finishOrdinaryAttempt(uuid.New(), scenario.outcome)
			require.Equal(t, 1, reporter.writes)
		})
	}
}

func TestKnownAIAndUnknownClassificationNeverBecomeOrdinaryAttempts(t *testing.T) {
	for _, classifier := range []*targetTypeStub{{kind: "NUMBER_AI_CREDIT"}, {err: errors.New("catalogue unavailable")}} {
		reporter := &rolloutReporter{}
		u := NewUseCase(Deps{TargetClassifier: classifier, UserProvider: &currentuser.StaticUserProvider{UserID: uuid.New(), OrganizationID: uuid.New()}, UsageReporter: reporter})
		_, err := u.Execute(t.Context(), "instance", "pool", &Command{Metadata: map[string]any{"unsupported": make(chan int)}})
		require.Error(t, err)
		require.Zero(t, reporter.writes)
		if classifier.kind != "" {
			require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(err))
		}
	}
	reporter := &rolloutReporter{}
	u := NewUseCase(Deps{UsageReporter: reporter})
	u.finishOrdinaryAttempt(uuid.New(), apierrors.Forbidden("AIUsage.Disabled", "disabled after LockPair"))
	require.Zero(t, reporter.writes, "the authoritative locked-type refusal cancels even an earlier ordinary classification")
}
