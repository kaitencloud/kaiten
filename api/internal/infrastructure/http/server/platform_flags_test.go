package server

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/platformflags"
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

func TestSelectedSourceIsCachedAndADriverReaderIsNot(t *testing.T) {
	t.Parallel()
	// A local source with a database handle is the one the server selects itself.
	local := func(ttl time.Duration) *Server {
		return &Server{cfg: config.Config{CoreConfig: config.CoreConfig{Metered: config.Metered{OrganizationID: uuid.NewString()}, AIUsage: config.AIUsage{FlagCacheTTL: ttl}}}, deps: Dependencies{DB: &pgxpool.Pool{}}}
	}
	s := local(30 * time.Second)
	require.NoError(t, s.setupPlatformFlags(t.Context()))
	require.IsType(t, &aiusage.CachedFlags{}, s.deps.PlatformFlags)

	s = local(0)
	require.NoError(t, s.setupPlatformFlags(t.Context()))
	require.IsType(t, &platformflags.Reader{}, s.deps.PlatformFlags, "a zero TTL keeps every operation on the source")

	s = &Server{cfg: config.Config{CoreConfig: config.CoreConfig{AIUsage: config.AIUsage{FlagCacheTTL: 30 * time.Second}}}, deps: Dependencies{PlatformFlags: aitest.Flags(true)}}
	require.NoError(t, s.setupPlatformFlags(t.Context()))
	require.IsType(t, aitest.Flags(true), s.deps.PlatformFlags, "a reader handed in by the driver is used as given")
}
