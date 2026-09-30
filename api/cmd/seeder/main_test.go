package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// The local stack names these two as strings -- `seed-accounts` runs dev and
// `seed-data` runs demo -- so renaming or dropping one here breaks `task
// quickstart` with a runtime error nothing else catches.
func TestLocalTaskProfilesAreRegistered(t *testing.T) {
	profiles, err := selectProfiles(seedProfiles(), []string{
		"dev",
		"demo",
	})

	require.NoError(t, err)
	require.Len(t, profiles, 2)
	require.Equal(t, "dev", profiles[0].Name())
	require.Equal(t, "demo", profiles[1].Name())
}

// The SaaS local stack's compose overrides seed-accounts to run this instead of
// `dev` -- renaming or dropping it breaks that override with a runtime error
// nothing else catches, same as the dev/demo pair above.
func TestSaasLocalStackProfileIsRegistered(t *testing.T) {
	profiles, err := selectProfiles(seedProfiles(), []string{"saas"})

	require.NoError(t, err)
	require.Len(t, profiles, 1)
	require.Equal(t, "saas", profiles[0].Name())
}

func TestRunTokensRejectsUnknownContext(t *testing.T) {
	t.Setenv("KAITEN_DEV_JWT_SECRET", "test-secret")

	err := runTokens(t.TempDir()+"/tokens.json", "bogus")

	require.ErrorContains(t, err, `unknown --context "bogus"`)
}
