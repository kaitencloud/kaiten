package server

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
)

func TestPlatformFlagsAreIndependentOfMeteringAndCommercialDefaults(t *testing.T) {
	t.Parallel()
	org := uuid.New()
	for _, metered := range []bool{false, true} {
		for _, enabled := range []bool{false, true} {
			flags := aitest.Flags(enabled)
			s := &Server{cfg: config.Config{CoreConfig: config.CoreConfig{Metered: config.Metered{Enabled: metered}}}, deps: Dependencies{
				UsageReporter: services.NoopUsageReporter{}, ConnectorEntitlements: services.AlwaysEntitled{}, PlatformFlags: flags,
			}}
			require.NoError(t, s.setupPlatformFlags(t.Context()))
			policy := aiusage.Policy{Flags: s.deps.PlatformFlags}
			require.Equal(t, enabled, policy.Enabled(policy.Resolve(t.Context(), org)))
		}
	}
}

func TestMissingPlatformSourceIsClosedEvenWithDriverReporter(t *testing.T) {
	t.Parallel()
	s := &Server{deps: Dependencies{UsageReporter: services.NoopUsageReporter{}, ConnectorEntitlements: services.AlwaysEntitled{}}}
	require.NoError(t, s.setupPlatformFlags(t.Context()))
	require.Nil(t, s.deps.PlatformFlags)
	require.False(t, (aiusage.Policy{Flags: s.deps.PlatformFlags}).Enabled(t.Context()))
}

func TestLocalSourceWithNilDatabaseCannotConstructTypedNilReader(t *testing.T) {
	t.Parallel()
	s := &Server{cfg: config.Config{CoreConfig: config.CoreConfig{Metered: config.Metered{OrganizationID: uuid.NewString()}}}}
	require.NoError(t, s.setupPlatformFlags(t.Context()))
	require.Nil(t, s.deps.PlatformFlags)
}

func TestPartialRemoteSourceCannotFallBackOrReadCredentials(t *testing.T) {
	t.Parallel()
	for _, source := range []config.Metered{
		{OrganizationID: uuid.NewString(), APIURL: "https://not-contacted.invalid"},
		{OrganizationID: uuid.NewString(), TokenFile: "/not-read/platform-token"},
	} {
		s := &Server{cfg: config.Config{CoreConfig: config.CoreConfig{Metered: source}}}
		require.Error(t, s.setupPlatformFlags(context.Background()))
		require.Nil(t, s.deps.PlatformFlags)
		require.Nil(t, s.flagReporter)
	}
}
