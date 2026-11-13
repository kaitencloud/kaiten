package main

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
)

func TestLocalAIProfileIsRegisteredAndConvergent(t *testing.T) {
	profiles, err := selectProfiles(seedProfiles(), []string{"local-ai", "demo"})
	require.NoError(t, err)
	require.Len(t, profiles, 2)
	_, converges := profiles[0].(seeder.ConvergentProfile)
	require.True(t, converges, "an existing dev/demo tracker must not skip local flag preparation")
}

func TestLocalAIProfileRejectsRemoteSourceAndReset(t *testing.T) {
	local := config.Metered{OrganizationExternalID: "org_dogfooding"}
	require.NoError(t, validateLocalAIProfile([]string{"local-ai"}, local, false))
	require.ErrorContains(t, validateLocalAIProfile([]string{"local-ai"}, local, true), "--clean")
	for _, remote := range []config.Metered{
		{APIURL: "https://platform.invalid/api"},
		{TokenFile: "/synthetic/flags-token"},
		{Enabled: true},
	} {
		require.ErrorContains(t, validateLocalAIProfile([]string{"local-ai"}, remote, false), "local platform source")
	}
	require.ErrorContains(t, validateLocalAIProfile([]string{"local-ai"}, config.Metered{}, false), "org_dogfooding")
	// Ordinary demo may use a selected hosted source, but it never writes its flag.
	require.NoError(t, validateLocalAIProfile([]string{"demo"}, config.Metered{APIURL: "https://platform.invalid/api"}, false))
}

func TestPartialRemotePlatformSourceNeverChoosesLocal(t *testing.T) {
	for _, configured := range []config.Metered{
		{APIURL: "https://platform.invalid/api"},
		{TokenFile: "/synthetic/flags-token"},
		{APIURL: "https://platform.invalid/api", TokenFile: "/synthetic/flags-token"},
	} {
		require.True(t, remotePlatformSource(configured))
	}
	require.False(t, remotePlatformSource(config.Metered{}))
}

func TestSeedPlatformFlagsMissingLocalAuthorityIsClosed(t *testing.T) {
	for _, cfg := range []config.Metered{{}, {OrganizationExternalID: "org_dogfooding"}} {
		flags, reporter, err := newSeedPlatformFlags(t.Context(), nil, cfg)
		require.NoError(t, err)
		require.Nil(t, reporter, "metering off with a local source starts no reporter")
		value, err := flags.BooleanValue(t.Context(), uuid.New(), "ai-credits")
		require.False(t, value)
		require.Error(t, err)
	}
}

func TestSeedPlatformFlagsPartialRemoteWiringNeverFallsBack(t *testing.T) {
	for _, cfg := range []config.Metered{
		{APIURL: "https://platform.invalid/api"},
		{TokenFile: "/synthetic/flags-token"},
		{Enabled: true},
	} {
		flags, reporter, err := newSeedPlatformFlags(t.Context(), nil, cfg)
		require.Error(t, err)
		require.Nil(t, flags)
		require.Nil(t, reporter, "invalid source wiring must start no watcher")
	}
}
