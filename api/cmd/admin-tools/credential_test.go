package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/spf13/cobra"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/pkg/secretfile"
)

// createCommandWithTTL returns the real `platform-token create` command with
// --ttl set to the given value, which is how resolveExpiry learns the flag was
// provided. Cobra's Changed bit is the whole point of the test: a zero
// time.Duration is indistinguishable from an unset flag by value alone.
func createCommandWithTTL(t *testing.T, ttl string) *cobra.Command {
	t.Helper()

	cmd := buildPlatformTokenCreateCmd()
	require.NoError(t, cmd.Flags().Set("ttl", ttl))

	return cmd
}

func TestResolveExpiryRequiresExactlyOneLifetimeFlag(t *testing.T) {
	t.Run("neither flag is refused rather than defaulted", func(t *testing.T) {
		_, err := resolveExpiry(buildPlatformTokenCreateCmd(), 0, false)

		require.ErrorContains(t, err, "one of --ttl or --no-expiry is required")
	})

	t.Run("both flags are refused", func(t *testing.T) {
		_, err := resolveExpiry(createCommandWithTTL(t, "1h"), time.Hour, true)

		require.ErrorContains(t, err, "mutually exclusive")
	})
}

func TestResolveExpiryTranslatesTheChosenLifetime(t *testing.T) {
	t.Run("no-expiry is the absence of an instant", func(t *testing.T) {
		expiresAt, err := resolveExpiry(buildPlatformTokenCreateCmd(), 0, true)

		require.NoError(t, err)
		// nil, not a zero time: the use case reads the absence of a value as
		// "bounded by revocation only" and writes SQL NULL for it, so a zero
		// time.Time reaching it would mint a credential that expired in year 1.
		require.Nil(t, expiresAt, "a non-expiring credential must carry no expiry, not a zero time")
	})

	t.Run("a ttl becomes an absolute timestamp", func(t *testing.T) {
		expiresAt, err := resolveExpiry(createCommandWithTTL(t, "2m"), 2*time.Minute, false)

		require.NoError(t, err)
		require.NotNil(t, expiresAt)
		require.WithinDuration(t, time.Now().UTC().Add(2*time.Minute), *expiresAt, 10*time.Second)
	})

	// An explicitly passed --ttl=0s asks for a credential that is already expired,
	// and a negative one for a credential that expired before it was minted.
	// Neither is a lifetime anybody means to choose.
	t.Run("a non-positive ttl is refused", func(t *testing.T) {
		for _, ttl := range []string{"0s", "-1m"} {
			duration, parseErr := time.ParseDuration(ttl)
			require.NoError(t, parseErr)

			_, err := resolveExpiry(createCommandWithTTL(t, ttl), duration, false)

			require.ErrorContains(t, err, "--ttl must be a positive duration")
		}
	})
}

func TestParseScopesRequiresAtLeastOneValidScope(t *testing.T) {
	t.Run("empty and blank input is refused", func(t *testing.T) {
		for _, csv := range []string{"", "   ", ",", " , "} {
			_, err := parseScopes(csv)

			require.ErrorContains(t, err, "--scopes is required")
		}
	})

	t.Run("surrounding whitespace and empty entries are dropped", func(t *testing.T) {
		scopes, err := parseScopes(" read:tokens , write:tokens ,")

		require.NoError(t, err)
		require.Equal(t, []string{"read:tokens", "write:tokens"}, scopes)
	})

	// Delegated to scope.ValidateScopes rather than re-implemented, so a scope the
	// API would reject cannot be written into a credential here.
	t.Run("an unknown scope is refused", func(t *testing.T) {
		_, err := parseScopes("read:tokens,not:a:real:scope")

		require.Error(t, err)
	})
}

func TestEmitCredentialWritesNothingButTheCredentialToStdout(t *testing.T) {
	var stdout bytes.Buffer

	require.NoError(t, emitCredential(&stdout, "ksm_example", ""))

	// Exactly the value and a newline: this is what makes
	// TOKEN="$(kaiten-admin-tools platform-token create ...)" assign a usable
	// credential rather than a credential plus a banner.
	require.Equal(t, "ksm_example\n", stdout.String())
}

func TestEmitCredentialToFileLeavesStdoutEmpty(t *testing.T) {
	path := filepath.Join(t.TempDir(), "platform-token")
	var stdout bytes.Buffer

	require.NoError(t, emitCredential(&stdout, "ksm_example", path))

	require.Empty(t, stdout.String(), "with --output-file the credential must not also reach stdout")

	info, err := os.Stat(path)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o600), info.Mode().Perm())

	// The trailing newline is for whoever cats the file; every reader in the
	// codebase goes through secretfile.Read, which trims it.
	contents, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, "ksm_example\n", string(contents))

	read, err := secretfile.Read(path)
	require.NoError(t, err)
	require.Equal(t, "ksm_example", read)
}

func TestExpiresInIsUTC(t *testing.T) {
	expiresAt, err := expiresIn(time.Hour)

	require.NoError(t, err)
	require.NotNil(t, expiresAt)
	// The column behind this is `timestamp` without a time zone, so a local-time
	// value would silently shift the expiry by the host's offset.
	require.Equal(t, time.UTC, expiresAt.Location())
}
