package evaluateflag

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	customertargetingfacts "github.com/kaitencloud/kaiten/api/internal/modules/customers/targetingfacts"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

type rolloutFlags struct{ calls int }

func (f *rolloutFlags) BooleanValue(context.Context, uuid.UUID, string) (bool, error) {
	f.calls++
	return true, nil
}

// Non-zero size preserves distinct pointer identities for the two facts ports.
type factMarker struct{ _ int }

func (*factMarker) GetOneCustomerBySlug(context.Context, uuid.UUID, string) (*customertargetingfacts.Customer, error) {
	panic("facts must not be read by admission")
}

func (*factMarker) GetTargetingFactsByCustomerSlug(context.Context, uuid.UUID, string) ([]customertargetingfacts.TargetingFact, error) {
	panic("facts must not be read by admission")
}

func (*factMarker) GetTargetingFactsByInstance(context.Context, uuid.UUID, uuid.UUID) ([]customertargetingfacts.TargetingFact, error) {
	panic("facts must not be read by admission")
}

func TestTrustedSourceCannotRecursivelyEvaluateItsRolloutFlag(t *testing.T) {
	t.Parallel()
	source, target := uuid.New(), uuid.New()
	flags := &rolloutFlags{}
	policy := aiusage.Policy{Flags: flags}
	ordinary, closed := &factMarker{}, &factMarker{}
	u := NewUseCase(Deps{AIPolicy: policy, PlatformOrgID: source, CustomerFacts: ordinary, ClosedCustomerFacts: closed}, nil)
	inherited := policy.Resolve(t.Context(), source)
	flags.calls = 0
	ctx, facts := u.operationFacts(inherited, source)
	require.Same(t, closed, facts, "trusted source must use the explicitly closed AI-facts port")
	require.Zero(t, flags.calls, "source OFREP must not resolve its own policy")
	require.False(t, (aiusage.Policy{}).Enabled(ctx), "closed reader ignores inherited positive admission")
	ctx, facts = u.operationFacts(t.Context(), target)
	require.Same(t, ordinary, facts)
	require.True(t, policy.Enabled(ctx), "ordinary flag evaluation retains enabled AI facts")
	require.Equal(t, 1, flags.calls)
	_, facts = u.operationFacts(t.Context(), target)
	require.Same(t, ordinary, facts)
	require.Equal(t, 2, flags.calls, "another ordinary operation must evaluate again")
}
