package aiusage_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type flagsFunc func(context.Context, uuid.UUID, string) (bool, error)

func (f flagsFunc) BooleanValue(ctx context.Context, org uuid.UUID, key string) (bool, error) {
	return f(ctx, org, key)
}

func TestZeroPolicyAndUnresolvedContextDeny(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	var zero aiusage.Policy
	require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(zero.RequireEnabled(ctx)))
	configured := aiusage.Policy{Flags: flagsFunc(func(context.Context, uuid.UUID, string) (bool, error) { return true, nil })}
	require.False(t, configured.Enabled(ctx), "a source is not itself a decision")
	require.False(t, zero.Enabled(configured.Resolve(ctx, uuid.New())), "closed source readers cannot inherit an enabled decision")
	for _, kind := range []string{"NUMBER", "BOOLEAN", "CONFIG"} {
		require.NoError(t, zero.RequireType(ctx, kind), "ordinary types stay independent")
	}
	require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(zero.RequireType(ctx, "NUMBER_AI_CREDIT")))
}

func TestCurrentOrganizationDecisionFailsClosed(t *testing.T) {
	t.Parallel()
	org := uuid.New()
	for _, tc := range []struct {
		name  string
		value bool
		err   error
		want  bool
	}{
		{"enabled", true, nil, true},
		{"disabled", false, nil, false},
		{"source error", false, errors.New("unready"), false},
		{"stale positive with error", true, errors.New("source lost"), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			policy := aiusage.Policy{Flags: flagsFunc(func(_ context.Context, target uuid.UUID, key string) (bool, error) {
				calls++
				require.Equal(t, org, target)
				require.Equal(t, "ai-credits", key)
				return tc.value, tc.err
			})}
			ctx := policy.Resolve(t.Context(), org)
			require.Equal(t, tc.want, policy.Enabled(ctx))
			_ = policy.RequireEnabled(ctx)
			_ = policy.RequireType(ctx, "NUMBER_AI_CREDIT")
			require.Equal(t, 1, calls, "helpers must not evaluate remotely")
			wrong := principal.ContextWithPrincipal(ctx, &principal.Principal{Kind: principal.KindOrganization, OrganizationID: uuid.New()})
			require.False(t, policy.Enabled(wrong), "another organization cannot borrow the snapshot")
		})
	}
}

func TestNewOperationDoesNotReuseInheritedPositive(t *testing.T) {
	t.Parallel()
	org, enabled, calls := uuid.New(), true, 0
	policy := aiusage.Policy{Flags: flagsFunc(func(context.Context, uuid.UUID, string) (bool, error) {
		calls++
		return enabled, nil
	})}
	first := policy.Resolve(t.Context(), org)
	require.True(t, policy.Enabled(first))
	enabled = false
	second := policy.Resolve(first, org)
	require.False(t, policy.Enabled(second), "new operations, including replay, must re-evaluate")
	require.True(t, policy.Enabled(first), "an admitted operation keeps its local decision")
	require.Equal(t, 2, calls)
}

func TestNilOrganizationAndCanceledOperationCannotEnable(t *testing.T) {
	t.Parallel()
	calls := 0
	policy := aiusage.Policy{Flags: flagsFunc(func(context.Context, uuid.UUID, string) (bool, error) { calls++; return true, nil })}
	require.False(t, policy.Enabled(policy.Resolve(t.Context(), uuid.Nil)))
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	require.False(t, policy.Enabled(policy.Resolve(ctx, uuid.New())))
	require.Zero(t, calls)
	ctx, cancel = context.WithCancel(t.Context())
	resolved := policy.Resolve(ctx, uuid.New())
	cancel()
	require.False(t, policy.Enabled(resolved))
}
