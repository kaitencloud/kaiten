package config_test

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/seeder/seedkit"
	"github.com/kaitencloud/kaiten/api/pkg/externalid"
)

// minimum is the two settings with no default: without them nothing loads, so
// every test that is about something else sets them and says nothing more. It
// also points discovery at an empty directory, because a package directory that
// grows a config.yaml would silently change every test in this file.
func minimum(t *testing.T) {
	t.Helper()
	t.Setenv("KAITEN_DATABASE_CONNECTION_STRING", "postgres://kaiten:kaiten@localhost:5432/kaiten?sslmode=disable")
	t.Setenv("KAITEN_API_PORT", "8080")
	t.Setenv(config.DirEnvVar, t.TempDir())
}

// write puts a configuration file in a fresh directory and points the loader at
// it. What it returns is nothing: the point is always what LoadConfig then does.
func write(t *testing.T, name, body string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	require.NoError(t, os.WriteFile(path, []byte(body), 0o600))
	t.Setenv(config.FileEnvVar, path)
}

// The three formats, asserted to be one configuration. viper picks the parser off
// the extension, so this is really "the extension selects the parser, and all
// three arrive at the same struct".
func TestLoadsEveryFormat(t *testing.T) {
	for name, body := range map[string]string{
		"config.yaml": "server:\n  port: 9000\nlogging:\n  level: debug\n",
		"config.toml": "[server]\nport = 9000\n[logging]\nlevel = \"debug\"\n",
		"config.json": `{"server":{"port":9000},"logging":{"level":"debug"}}`,
	} {
		t.Run(name, func(t *testing.T) {
			minimum(t)
			// The file is the thing under test here, so the variable that would
			// otherwise win has to go.
			require.NoError(t, os.Unsetenv("KAITEN_API_PORT")) //nolint:usetesting // t.Setenv cannot unset
			write(t, name, body)

			cfg, err := config.LoadConfig()

			require.NoError(t, err)
			assert.Equal(t, uint(9000), cfg.Server.Port)
			assert.Equal(t, "debug", cfg.Logging.Level)
		})
	}
}

// No file is a supported shape, not a half-configured one: a deployment that has
// only ever set variables gets exactly the configuration it always got. This is
// also the assertion that BindEnv rather than AutomaticEnv is load-bearing --
// viper consults the environment only for keys it has been told about, so a table
// row that stopped being registered would come back zero here.
func TestNoFileIsNotAnError(t *testing.T) {
	minimum(t)
	t.Setenv("KAITEN_RETENTION_RETIRED_TOKENS", "48h")
	t.Setenv("VAULT_CONNECTORS_BASE_PATH", "acme/connectors")

	cfg, err := config.LoadConfig()

	require.NoError(t, err)
	assert.Equal(t, uint(8080), cfg.Server.Port)
	assert.Equal(t, 48*time.Hour, cfg.Retention.RetiredTokens)
	assert.Equal(t, "acme/connectors", cfg.Connectors.VaultBasePath)
}

// A file somebody named must exist; a file nobody named is optional. The two
// halves of one rule, and the first is what turns a typo'd mount path into an
// error rather than a server quietly running on defaults.
func TestANamedFileMustExist(t *testing.T) {
	minimum(t)
	t.Setenv(config.FileEnvVar, filepath.Join(t.TempDir(), "absent.yaml"))

	_, err := config.LoadConfig()

	require.ErrorContains(t, err, config.FileEnvVar)
}

func TestEnvironmentBeatsTheFile(t *testing.T) {
	minimum(t)
	write(t, "config.yaml", "logging:\n  level: debug\n")
	t.Setenv("LOG_LEVEL", "error")

	cfg, err := config.LoadConfig()

	require.NoError(t, err)
	assert.Equal(t, "error", cfg.Logging.Level)
}

func TestDefaultsFillWhatNobodySet(t *testing.T) {
	minimum(t)

	cfg, err := config.LoadConfig()

	require.NoError(t, err)
	assert.Equal(t, "warn", cfg.Logging.Level)
	assert.Equal(t, "json", cfg.Logging.Format)
	assert.Equal(t, uint(3001), cfg.Server.PlatformPort)
	assert.True(t, cfg.Retention.Enabled)
	assert.Equal(t, 12*time.Hour, cfg.Retention.Interval)
	assert.Equal(t, int32(1000), cfg.Retention.BatchSize)
	assert.Equal(t, "kaiten/connectors", cfg.Connectors.VaultBasePath)
}

// A key no field claims is a setting that silently never applies: the value is
// read, discarded, and the default it was meant to override stays. That is the
// expensive failure this package exists to refuse -- so `intervall` fails, and
// the message names it.
func TestRefusesAKeyNothingReads(t *testing.T) {
	minimum(t)
	write(t, "config.yaml", "retention:\n  intervall: 1h\n")

	_, err := config.LoadConfig()

	require.Error(t, err)
	assert.Contains(t, err.Error(), "intervall")
}

// The loader does not expand ${VAR} in a file, and the chart refuses credential
// settings there entirely (kaiten.apiSecretKeys, kaiten.validateApiConfig). A
// file value is just a string, ${...} included.
func TestFileValuesAreLiteral(t *testing.T) {
	minimum(t)
	// The file's value is the thing under test, and minimum sets this variable
	// -- which would win, silently, and assert nothing.
	require.NoError(t, os.Unsetenv("KAITEN_DATABASE_CONNECTION_STRING")) //nolint:usetesting // t.Setenv cannot unset
	write(t, "config.yaml", "database:\n  connection_string: ${A_SECRET}\n")

	cfg, err := config.LoadConfig()

	require.NoError(t, err)
	assert.Equal(t, "${A_SECRET}", cfg.Database.ConnectionString)
}

// The settings with no default, refused together rather than one render at a
// time: an operator fixing a configuration wants the whole list.
func TestRefusesAConfigurationThatCannotRun(t *testing.T) {
	t.Run("names every missing setting at once, in both vocabularies", func(t *testing.T) {
		t.Setenv(config.DirEnvVar, t.TempDir())

		_, err := config.LoadConfig()

		require.Error(t, err)
		assert.Contains(t, err.Error(), "KAITEN_DATABASE_CONNECTION_STRING")
		assert.Contains(t, err.Error(), "database.connection_string")
		assert.Contains(t, err.Error(), "KAITEN_API_PORT")
		assert.Contains(t, err.Error(), "server.port")
	})

	// A whitespace-only value is a value somebody meant to set and did not.
	t.Run("whitespace is not a value", func(t *testing.T) {
		minimum(t)
		t.Setenv("KAITEN_DATABASE_CONNECTION_STRING", "   ")

		_, err := config.LoadConfig()

		require.ErrorContains(t, err, "database.connection_string")
	})

	t.Run("an out-of-range value is refused with its key", func(t *testing.T) {
		minimum(t)
		t.Setenv("LOG_LEVEL", "chatty")

		_, err := config.LoadConfig()

		require.Error(t, err)
		assert.Contains(t, err.Error(), "logging.level")
		assert.Contains(t, err.Error(), "LOG_LEVEL")
	})
}

// TestSeparatesTheTwoListenerPorts covers the one port combination that cannot
// work. The Core and Platform APIs are two sockets in one process, so equal ports
// mean the second bind fails and the process exits -- and it exits with "address
// already in use", which reads like something else on the host took the port
// rather than like a configuration mistake.
func TestSeparatesTheTwoListenerPorts(t *testing.T) {
	t.Run("refuses a platform port equal to the API port", func(t *testing.T) {
		minimum(t)
		t.Setenv(config.PlatformPortEnvVar, "8080")

		_, err := config.LoadConfig()

		require.Error(t, err)
		assert.Contains(t, err.Error(), config.PlatformPortEnvVar)
	})

	t.Run("accepts distinct ports", func(t *testing.T) {
		minimum(t)
		t.Setenv(config.PlatformPortEnvVar, "8081")

		cfg, err := config.LoadConfig()

		require.NoError(t, err)
		assert.Equal(t, uint(8080), cfg.Server.Port)
		assert.Equal(t, uint(8081), cfg.Server.PlatformPort)
	})

	// The variable is defaulted rather than required, so a deployment that has
	// never heard of it still starts -- with its Platform API on a port nothing
	// routes to, which is where an unrouted port is exactly right.
	t.Run("defaults when unset", func(t *testing.T) {
		minimum(t)

		cfg, err := config.LoadConfig()

		require.NoError(t, err)
		assert.NotZero(t, cfg.Server.PlatformPort)
		assert.NotEqual(t, cfg.Server.Port, cfg.Server.PlatformPort)
	})
}

// Reporting with no target configured is refused here, the same way Helm
// refuses the equivalent -- for every path that does not go through Helm.
func TestRefusesMeteringWithNoTarget(t *testing.T) {
	t.Run("off is the ordinary case and needs no target", func(t *testing.T) {
		minimum(t)

		_, err := config.LoadConfig()

		require.NoError(t, err)
	})

	t.Run("on with no target is refused, naming the variable", func(t *testing.T) {
		minimum(t)
		t.Setenv("KAITEN_METERED_ENABLED", "true")

		_, err := config.LoadConfig()

		require.Error(t, err)
		assert.Contains(t, err.Error(), "KAITEN_METERED_API_URL")
	})

	t.Run("whitespace is not a target", func(t *testing.T) {
		minimum(t)
		t.Setenv("KAITEN_METERED_ENABLED", "true")
		t.Setenv("KAITEN_METERED_API_URL", "   ")
		t.Setenv("KAITEN_METERED_TOKEN_FILE", "/var/run/kaiten/token")

		_, err := config.LoadConfig()

		require.Error(t, err)
		assert.Contains(t, err.Error(), "KAITEN_METERED_API_URL")
	})

	// The reporter refuses an empty path, so reporting turned on with nowhere to
	// read the credential is a crash loop rather than a misconfiguration.
	t.Run("on with no token file is refused too", func(t *testing.T) {
		minimum(t)
		t.Setenv("KAITEN_METERED_ENABLED", "true")
		t.Setenv("KAITEN_METERED_API_URL", "https://metered.example.com")

		_, err := config.LoadConfig()

		require.Error(t, err)
		assert.Contains(t, err.Error(), "KAITEN_METERED_TOKEN_FILE")
	})

	t.Run("on with both is fine", func(t *testing.T) {
		minimum(t)
		t.Setenv("KAITEN_METERED_ENABLED", "true")
		t.Setenv("KAITEN_METERED_API_URL", "https://metered.example.com")
		t.Setenv("KAITEN_METERED_TOKEN_FILE", "/var/run/kaiten/token")

		_, err := config.LoadConfig()

		require.NoError(t, err)
	})
}

// The invariant this block exists for: the organization the runtime treats as the
// platform must be the organization the seeder actually creates.
func TestResolvePlatformOrgID(t *testing.T) {
	t.Run("derives the same organization the seeder creates", func(t *testing.T) {
		d := config.Metered{OrganizationExternalID: "org_dogfooding"}

		got, err := d.ResolvePlatformOrgID()

		require.NoError(t, err)
		require.Equal(t, seedkit.DevData.DogfoodingOrgID, got,
			"the runtime and the seeder must designate the same organization")
	})

	t.Run("is not the well-known default organization", func(t *testing.T) {
		// The value the old default carried, spelled out so a future edit that
		// reintroduces it has to argue with this test.
		d := config.Metered{OrganizationExternalID: "org_dogfooding"}

		got, err := d.ResolvePlatformOrgID()

		require.NoError(t, err)
		require.NotEqual(t, uuid.MustParse("00000000-0000-0000-0000-000000000001"), got)
		require.Equal(t, seedkit.DevData.TMNTHQOrgID, uuid.MustParse("00000000-0000-0000-0000-000000000001"),
			"that id belongs to a tenant, which is why it was the wrong default")
	})

	t.Run("an explicit UUID still wins, for a deployment that pins one", func(t *testing.T) {
		pinned := uuid.MustParse("2f1d1a3e-0000-4000-8000-000000000abc")
		d := config.Metered{
			OrganizationExternalID: "org_dogfooding",
			OrganizationID:         pinned.String(),
		}

		got, err := d.ResolvePlatformOrgID()

		require.NoError(t, err)
		require.Equal(t, pinned, got)
	})

	t.Run("derives from a custom external id", func(t *testing.T) {
		d := config.Metered{OrganizationExternalID: "org_acme_platform"}

		got, err := d.ResolvePlatformOrgID()

		require.NoError(t, err)
		require.Equal(t, externalid.DeriveOrganizationID("org_acme_platform"), got)
	})

	t.Run("reports a malformed override instead of falling back silently", func(t *testing.T) {
		// Falling back to the derived value here would hide a typo in a
		// deployment's own configuration.
		d := config.Metered{
			OrganizationExternalID: "org_dogfooding",
			OrganizationID:         "not-a-uuid",
		}

		_, err := d.ResolvePlatformOrgID()

		require.ErrorContains(t, err, "not a UUID")
	})

	t.Run("nothing configured resolves to nobody, not an error", func(t *testing.T) {
		// The ordinary state of every standalone fleet: it meters into a Kaiten
		// whose tenants it does not hold, so there is no own organization to
		// exempt. Returning an error here made that boot log a warning about a
		// misconfiguration that was not one, and the runtime already reads
		// uuid.Nil as "exempt nobody".
		got, err := config.Metered{}.ResolvePlatformOrgID()

		require.NoError(t, err)
		require.Equal(t, uuid.Nil, got)
	})
}

// The variables that used to work must fail, not be ignored.
//
// viper reads the environment only for keys it has been told about, so removing
// a row from the settings table does not reject the old variable -- it makes it
// invisible. A deployment carrying KAITEN_DOGFOODING_ENABLED=true after this
// rename would start cleanly, report nothing, and give no indication anywhere
// that its metering had stopped. This is the assertion that it stops loudly
// instead.
func TestRefusesTheRenamedVariables(t *testing.T) {
	for _, old := range []string{
		"KAITEN_DOGFOODING_ENABLED",
		"KAITEN_DOGFOODING_ORGANIZATION_EXTERNAL_ID",
		"KAITEN_DOGFOODING_ORGANIZATION_ID",
		"KAITEN_DOGFOODING_API_URL",
		"KAITEN_DOGFOODING_TOKEN_FILE",
	} {
		t.Run(old, func(t *testing.T) {
			minimum(t)
			// Empty, and still refused: what is wrong is that the variable is set
			// at all, by someone who believes it configures something.
			t.Setenv(old, "")

			_, err := config.LoadConfig()

			require.Error(t, err)
			assert.Contains(t, err.Error(), old, "the message has to name what to remove")
			assert.Contains(t, err.Error(), "KAITEN_METERED_", "and what to write instead")
		})
	}

	t.Run("the new names load", func(t *testing.T) {
		minimum(t)
		t.Setenv("KAITEN_METERED_ENABLED", "true")
		t.Setenv("KAITEN_METERED_API_URL", "https://metered.example.com")
		t.Setenv("KAITEN_METERED_TOKEN_FILE", "/var/run/kaiten/token")
		t.Setenv("KAITEN_METERED_ORGANIZATION_EXTERNAL_ID", "org_dogfooding")

		cfg, err := config.LoadConfig()

		require.NoError(t, err)
		assert.True(t, cfg.Metered.Enabled)
		assert.Equal(t, "https://metered.example.com", cfg.Metered.APIURL)
		assert.Equal(t, "org_dogfooding", cfg.Metered.OrganizationExternalID)
	})

	// Both facts at once: this deployment holds other people's tenants AND
	// reports its own usage somewhere. The old CI rule called that a
	// contradiction and refused it; the loader never did, and this is the
	// assertion that it still does not.
	t.Run("metering others and reporting are not exclusive", func(t *testing.T) {
		minimum(t)
		t.Setenv("KAITEN_METERED_ENABLED", "true")
		t.Setenv("KAITEN_METERED_API_URL", "https://metered.example.com")
		t.Setenv("KAITEN_METERED_TOKEN_FILE", "/var/run/kaiten/token")
		t.Setenv("KAITEN_METERED_ORGANIZATION_EXTERNAL_ID", "org_acme_platform")

		cfg, err := config.LoadConfig()

		require.NoError(t, err)
		got, err := cfg.Metered.ResolvePlatformOrgID()
		require.NoError(t, err)
		assert.Equal(t, externalid.DeriveOrganizationID("org_acme_platform"), got)
	})
}

// The file key, not the variable. `metered:` is what an operator writes in
// config.yaml, and the settings table and the struct field are two places that
// have to agree about it -- UnmarshalExact refuses a key no field claims, so a
// half-finished rename fails here rather than at the first metering gap.
func TestTheFileKeyIsMetered(t *testing.T) {
	minimum(t)
	write(t, "config.yaml", "metered:\n  enabled: true\n  api_url: https://metered.example.com\n"+
		"  token_file: /var/run/kaiten/token\n")

	cfg, err := config.LoadConfig()

	require.NoError(t, err)
	assert.True(t, cfg.Metered.Enabled)

	t.Run("and the old one is refused", func(t *testing.T) {
		minimum(t)
		write(t, "config.yaml", "dogfooding:\n  enabled: true\n")

		_, err := config.LoadConfig()

		require.ErrorContains(t, err, "dogfooding")
	})
}
