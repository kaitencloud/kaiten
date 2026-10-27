package reportentitlementusagemetric

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/aihistory"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type rolloutReporter struct{ writes int }

func (r *rolloutReporter) TrackAsync(uuid.UUID, string)     { r.writes++ }
func (r *rolloutReporter) DecrementAsync(uuid.UUID, string) { r.writes++ }
func (r *rolloutReporter) ReportAndEnforce(context.Context, uuid.UUID, string) error {
	r.writes++
	return nil
}

func (r *rolloutReporter) Decrement(context.Context, uuid.UUID, string) error { r.writes++; return nil }

func TestDisabledIncomingAIRejectsEveryPhaseBeforeDatabaseAndCounters(t *testing.T) {
	t.Parallel()
	user := &currentuser.StaticUserProvider{UserID: uuid.New(), OrganizationID: uuid.New()}
	for _, phase := range []string{"reserve", "commit", "release", "invalid"} {
		t.Run(phase, func(t *testing.T) {
			reporter := &rolloutReporter{}
			// No Uof or query handle: touching accounting/replay would panic.
			u := NewUseCase(Deps{UserProvider: user, UsageReporter: reporter})
			key := "generic-header-cannot-override-off"
			result, err := u.Execute(t.Context(), "instance", "pool", &Command{TransactionID: &key, AI: &schema.AiUsageValue{Phase: phase, TransactionID: "same-transaction"}})
			require.Nil(t, result)
			require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(err))
			require.Zero(t, reporter.writes)
		})
	}
	reader := aihistory.Reader{User: user}
	_, err := reader.Inferences(t.Context(), "instance", "pool", aihistory.Filter{})
	require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(err))
	_, err = reader.Reservations(t.Context(), "instance", "pool")
	require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(err))
}

type rejectedUser struct{ err error }

func (r rejectedUser) GetUser(context.Context) (*currentuser.User, error) { return nil, r.err }

func TestReportIdentityMustResolveBeforeRolloutPolicy(t *testing.T) {
	t.Parallel()
	denied := errors.New("wrong organization")
	for _, enabled := range []bool{false, true} {
		u := NewUseCase(Deps{UserProvider: rejectedUser{denied}, AIPolicy: aiusage.Policy{Flags: aitest.Flags(enabled)}})
		_, err := u.Execute(t.Context(), "instance", "pool", &Command{AI: &schema.AiUsageValue{Phase: "reserve"}})
		require.ErrorIs(t, err, denied)
	}
}

// The first admitted attempt stops before the database on header validation;
// a later operation sharing the original context must still observe revocation.
type changingRolloutFlags struct {
	enabled        bool
	calls          int
	organizationID uuid.UUID
}

func (f *changingRolloutFlags) BooleanValue(_ context.Context, org uuid.UUID, key string) (bool, error) {
	f.calls++
	if org != f.organizationID || key != "ai-credits" {
		return false, errors.New("unexpected rollout target")
	}
	return f.enabled, nil
}

func TestNewReportOperationReevaluatesBeforeValidationReplayOrTransaction(t *testing.T) {
	t.Parallel()
	org := uuid.New()
	flags := &changingRolloutFlags{enabled: true, organizationID: org}
	policy := aiusage.Policy{Flags: flags}
	reporter := &rolloutReporter{}
	u := NewUseCase(Deps{AIPolicy: policy, UserProvider: &currentuser.StaticUserProvider{UserID: uuid.New(), OrganizationID: org}, UsageReporter: reporter})
	inherited := policy.Resolve(t.Context(), org)
	flags.calls = 0
	key := "not-an-AI-identity"
	command := &Command{TransactionID: &key, AI: &schema.AiUsageValue{Phase: "reserve", TransactionID: "exact-replay"}}
	_, err := u.Execute(inherited, "instance", "pool", command)
	require.Equal(t, "ReportEntitlementUsageMetric.AiIdempotencyKeyUnsupported", apierrors.GetCode(err))
	require.Equal(t, 1, flags.calls, "one decision before validation and the absent transaction handle")
	flags.enabled = false
	_, err = u.Execute(inherited, "instance", "pool", command)
	require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(err))
	require.Equal(t, 2, flags.calls)
	require.Zero(t, reporter.writes, "revocation must precede counters, replay and writes")
}
