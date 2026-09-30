// Command kaiten-admin-tools is a standalone operational CLI for the Kaiten
// database schema: goose migrations, migration status, schema version. It runs
// as a Helm pre-install/pre-upgrade hook Job or a one-shot compose service,
// never as a long-running process.
package main

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strconv"
	"text/tabwriter"
	"time"

	"github.com/pressly/goose/v3"
	"github.com/spf13/cobra"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
	"github.com/kaitencloud/kaiten/api/pkg/otelcommon"
)

func main() {
	// Stderr, not stdout, for every log line this binary writes. Its stdout is a
	// payload channel: the migrate commands print a table there, and the credential
	// commands print a secret and nothing else, so that
	// `TOKEN="$(kaiten-admin-tools platform-token create ...)"` yields a usable
	// credential. A JSON log record interleaved into that is not noise, it is
	// corruption -- and in a Kubernetes Job, whose stdout is its retained log, it
	// would also be the wrong place for the secret to land.
	slog.SetDefault(otelcommon.NewLoggerTo(os.Stderr, os.Getenv("LOG_LEVEL"), os.Getenv("LOG_FORMAT")))

	if err := newRootCommand().Execute(); err != nil {
		slog.Error("kaiten-admin-tools command failed", "error", err)
		os.Exit(1)
	}
}

// newRootCommand assembles the command tree. Separate from main so tests can
// execute a command with their own stdout, stderr and arguments -- which is the
// only way to assert the stdout contract the credential commands promise.
func newRootCommand() *cobra.Command {
	rootCmd := &cobra.Command{
		Use:           "kaiten-admin-tools",
		Short:         "Kaiten administrative CLI",
		SilenceUsage:  true,
		SilenceErrors: true,
		Long: `Operational tooling for the Kaiten database schema.

All subcommands read the database connection string from
KAITEN_DATABASE_CONNECTION_STRING - there is no config file or flag for it,
matching how the server and seeder binaries are wired in every environment
(compose, Helm hook Jobs, CI).`,
	}

	rootCmd.AddCommand(buildMigrateCmd())
	rootCmd.AddCommand(buildOrganizationCmd())
	rootCmd.AddCommand(buildUserCmd())
	rootCmd.AddCommand(buildPlatformTokenCmd())
	rootCmd.AddCommand(buildServiceTokenCmd())

	return rootCmd
}

// connStringFromEnv reads the database connection string every subcommand
// needs. Required (not defaulted) - there is no sane default connection
// string, and a silent fallback to one would risk running migrations against
// the wrong database.
func connStringFromEnv() (string, error) {
	dsn := os.Getenv("KAITEN_DATABASE_CONNECTION_STRING")
	if dsn == "" {
		return "", errors.New("KAITEN_DATABASE_CONNECTION_STRING is required")
	}
	return dsn, nil
}

func buildMigrateCmd() *cobra.Command {
	migrateCmd := &cobra.Command{
		Use:   "migrate",
		Short: "Manage the database schema (goose migrations)",
	}

	migrateCmd.AddCommand(buildMigrateUpCmd())
	migrateCmd.AddCommand(buildMigrateStatusCmd())
	migrateCmd.AddCommand(buildMigrateVersionCmd())
	migrateCmd.AddCommand(buildMigrateDownToCmd())

	return migrateCmd
}

func buildMigrateUpCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "up",
		Short: "Apply all pending migrations",
		Args:  cobra.NoArgs,
		RunE: func(_ *cobra.Command, _ []string) error {
			dsn, err := connStringFromEnv()
			if err != nil {
				return err
			}

			if err := database.RunMigrations(dsn); err != nil {
				return fmt.Errorf("error running migrations: %w", err)
			}

			slog.Info("migrations completed successfully")
			return nil
		},
	}
}

func buildMigrateStatusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Print the applied/pending state of every known migration",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			dsn, err := connStringFromEnv()
			if err != nil {
				return err
			}

			status, err := database.MigrationStatus(cmd.Context(), dsn)
			if err != nil {
				return fmt.Errorf("error getting migration status: %w", err)
			}

			writeStatusTable(cmd.OutOrStdout(), status)
			return nil
		},
	}
}

func writeStatusTable(out io.Writer, status []*goose.MigrationStatus) {
	tw := tabwriter.NewWriter(out, 0, 4, 2, ' ', 0)
	_, _ = fmt.Fprintln(tw, "VERSION\tSTATE\tAPPLIED_AT")
	for _, s := range status {
		appliedAt := "-"
		if s.State == goose.StateApplied {
			appliedAt = s.AppliedAt.Format(time.RFC3339)
		}
		_, _ = fmt.Fprintf(tw, "%d\t%s\t%s\n", s.Source.Version, s.State, appliedAt)
	}
	_ = tw.Flush()
}

func buildMigrateVersionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print the DB schema version and this binary's expected version",
		Long: `Print the DB schema version and this binary's expected version.

Exits non-zero if the DB version is behind what this binary expects -
suitable as an init-container readiness check ahead of starting the server
or seeder.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			dsn, err := connStringFromEnv()
			if err != nil {
				return err
			}

			expected, err := database.ExpectedVersion()
			if err != nil {
				return fmt.Errorf("error getting expected version: %w", err)
			}

			pool, err := database.ConnectDB(dsn)
			if err != nil {
				return fmt.Errorf("error connecting to database: %w", err)
			}
			defer pool.Close()

			current, err := database.DBVersion(cmd.Context(), pool)
			if err != nil {
				return fmt.Errorf("error getting database version: %w", err)
			}

			_, _ = fmt.Fprintf(cmd.OutOrStdout(), "database version: %d\nexpected version: %d\n", current, expected)

			if current < expected {
				return fmt.Errorf("database schema is behind: db version %d, expected %d - run `kaiten-admin-tools migrate up`", current, expected)
			}

			return nil
		},
	}
}

func buildMigrateDownToCmd() *cobra.Command {
	var yes bool

	cmd := &cobra.Command{
		Use:   "down-to <version>",
		Short: "Migrate the database down to a specific version (destructive)",
		Long: `Migrate the database down to a specific version.

This runs migrations' Down scripts, which commonly drop columns, tables, or
data - it is destructive and cannot be undone by "migrate up". Guarded
behind two independent opt-ins (a CLI flag and an environment variable) so
it can't be triggered by a copy-pasted "migrate down-to N" alone, e.g. from
a runbook meant for a different environment.`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if !yes || os.Getenv("KAITEN_ALLOW_DOWN_MIGRATIONS") != "true" {
				return errors.New(
					"refusing to run a down migration: this is destructive. " +
						"Pass --yes AND set KAITEN_ALLOW_DOWN_MIGRATIONS=true to confirm",
				)
			}

			version, err := strconv.ParseInt(args[0], 10, 64)
			if err != nil {
				return fmt.Errorf("invalid version %s: %w", strconv.Quote(args[0]), err)
			}

			dsn, err := connStringFromEnv()
			if err != nil {
				return err
			}

			if err := database.DownTo(cmd.Context(), dsn, version); err != nil {
				return fmt.Errorf("error migrating down to version %d: %w", version, err)
			}

			slog.Info("migrated down successfully", "version", version)
			return nil
		},
	}

	cmd.Flags().BoolVar(&yes, "yes", false, "Confirm this destructive operation")

	return cmd
}
