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
		u := NewUseCase(Deps{UserProvider: rejectedUser{denied}, AIPolicy: aiusage.Policy{Enabled: enabled}})
		_, err := u.Execute(t.Context(), "instance", "pool", &Command{AI: &schema.AiUsageValue{Phase: "reserve"}})
		require.ErrorIs(t, err, denied)
	}
}
