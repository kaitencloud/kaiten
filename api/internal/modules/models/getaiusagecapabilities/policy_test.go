package getaiusagecapabilities_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/models/getaiusagecapabilities"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

type capabilityFlags func(context.Context, uuid.UUID, string) (bool, error)

func (f capabilityFlags) BooleanValue(ctx context.Context, org uuid.UUID, key string) (bool, error) {
	return f(ctx, org, key)
}

func TestCapabilitiesUseCurrentSameOrganizationFlagWithoutPositiveCache(t *testing.T) {
	t.Parallel()
	enabledOrg, otherOrg := uuid.New(), uuid.New()
	enabled, calls := true, 0
	var sourceErr error
	policy := aiusage.Policy{Flags: capabilityFlags(func(_ context.Context, org uuid.UUID, key string) (bool, error) {
		calls++
		require.Equal(t, "ai-credits", key)
		return enabled && org == enabledOrg, sourceErr
	})}
	usecase := getaiusagecapabilities.UseCase{Policy: policy}
	ctx := policy.Resolve(t.Context(), enabledOrg)
	calls = 0
	require.True(t, usecase.Read(ctx, enabledOrg).Enabled)
	require.False(t, usecase.Read(ctx, otherOrg).Enabled, "no borrowing another tenant's flag")
	enabled = false
	require.False(t, usecase.Read(ctx, enabledOrg).Enabled, "another call must reject inherited positive state")
	enabled, sourceErr = true, errors.New("source unready")
	require.False(t, usecase.Read(ctx, enabledOrg).Enabled, "stale/errored true never enables")
	require.Equal(t, 4, calls)
	require.False(t, (getaiusagecapabilities.UseCase{}).Read(t.Context(), enabledOrg).Enabled)
}
