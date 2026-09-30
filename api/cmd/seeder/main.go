package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/spf13/cobra"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	demoprofile "github.com/kaitencloud/kaiten/api/internal/seeder/profiles/demo"
	devprofile "github.com/kaitencloud/kaiten/api/internal/seeder/profiles/dev"
	saasprofile "github.com/kaitencloud/kaiten/api/internal/seeder/profiles/saas"
	stresstest "github.com/kaitencloud/kaiten/api/internal/seeder/profiles/stress-test"
	"github.com/kaitencloud/kaiten/api/internal/seeder/seedkit"
	"github.com/kaitencloud/kaiten/api/internal/shared/atomicfile"
	"github.com/kaitencloud/kaiten/api/internal/shared/jwtutil"
	"github.com/kaitencloud/kaiten/api/pkg/otelcommon"
)

func main() {
	slog.SetDefault(otelcommon.NewLogger(os.Getenv("LOG_LEVEL"), os.Getenv("LOG_FORMAT")))

	allProfiles := seedProfiles()

	var profileNames []string
	var organizationIDs []string
	var clean bool

	rootCmd := &cobra.Command{
		Use:           "seeder",
		Short:         "Kaiten database seeder CLI",
		SilenceUsage:  true,
		SilenceErrors: true,
		Long: `A CLI tool to seed the Kaiten database with test data.

Supports multiple profiles for different use cases:
  - dev: OSS-only local stack -- the shared TMNT identities on the Kaiten Sushi Shop org shell, no product data.
  - demo: the Kaiten Sushi Shop org's full B2B SaaS product data -- the default local/demo dataset.
  - saas: SaaS-stack local identities -- the same TMNT identities on Kaiten (Dogfooding) and an empty Demo Sandbox.
  - stress-test: High-volume seed across 4 orgs for load testing.

Examples:
  seeder --profile stress-test --clean                 # Reset DB (clears seeder records) and seed with stress-test profile
  seeder -p dev -p stress-test -c                      # Reset DB then seed both dev and stress-test profiles
  seeder -p demo --organization-ids 11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222
                                                       # Reseed existing organizations in place with the demo profile`,
		RunE: func(_ *cobra.Command, _ []string) error {
			if len(profileNames) == 0 {
				profileNames = []string{"stress-test"}
			}

			parsedOrganizationIDs, err := parseOrganizationIDs(organizationIDs)
			if err != nil {
				return err
			}

			if clean && len(parsedOrganizationIDs) > 0 {
				return errors.New("--clean and --organization-ids cannot be used together")
			}

			return runProfiles(allProfiles, profileNames, clean, parsedOrganizationIDs)
		},
	}

	rootCmd.Flags().StringArrayVarP(&profileNames, "profile", "p", nil, "Seed profile to run (repeatable: -p stress-test -p demo)")
	rootCmd.Flags().StringSliceVar(&organizationIDs, "organization-ids", nil, "Existing organization UUIDs to reseed in place (comma-separated)")
	rootCmd.Flags().BoolVarP(&clean, "clean", "c", false, "Reset database before seeding (drops DB, clears seeder records, reruns migrations)")

	// Add tokens command to generate dev JWT tokens
	tokensCmd := buildTokensCmd()
	rootCmd.AddCommand(tokensCmd)

	// Add list command to show available profiles
	listCmd := &cobra.Command{
		Use:   "list",
		Short: "List available seed profiles",
		Run: func(cmd *cobra.Command, _ []string) {
			writeAvailableProfiles(cmd.OutOrStdout(), allProfiles, "")
		},
	}
	rootCmd.AddCommand(listCmd)

	if err := rootCmd.Execute(); err != nil {
		slog.Error("seeder command failed", "error", err)
		os.Exit(1)
	}
}

func seedProfiles() []seeder.Profile {
	return []seeder.Profile{
		devprofile.NewProfile(),
		demoprofile.NewProfile(),
		saasprofile.NewProfile(),
		stresstest.NewProfile(),
	}
}

// runProfiles resets the database once (if --clean) then seeds each profile in order.
func runProfiles(allProfiles []seeder.Profile, profileNames []string, clean bool, organizationIDs []uuid.UUID) error {
	ctx := context.Background()

	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		return fmt.Errorf("error loading config: %w", err)
	}
	slog.SetDefault(otelcommon.NewLogger(cfg.Logging.Level, cfg.Logging.Format))

	// Initialize OpenTelemetry so outbox events carry a traceparent.
	if err := otelcommon.InitTracer(ctx, otelcommon.Config{
		Enabled:         cfg.Otel.Enabled,
		Endpoint:        cfg.Otel.Endpoint,
		MetricsEndpoint: cfg.Otel.MetricsEndpoint,
		ServiceName:     cfg.Otel.ServiceName,
		Insecure:        cfg.Otel.Insecure,
		Authorization:   cfg.Otel.Authorization,
		SamplingRatio:   cfg.Otel.TracesSamplingRatio,
	}); err != nil {
		slog.Warn("failed to setup telemetry", slog.String("error", err.Error()))
	}
	// Flush spans before the process exits (important for short-lived jobs).
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := otelcommon.Shutdown(shutdownCtx); err != nil {
			slog.Warn("telemetry shutdown error", slog.String("error", err.Error()))
		}
	}()

	// Root span — all outbox events created during seeding will be children of this span.
	tracer := otel.Tracer("kaiten-seeder")
	ctx, span := tracer.Start(
		ctx, "seeder.run",
		trace.WithSpanKind(trace.SpanKindProducer),
		trace.WithAttributes(
			attribute.StringSlice("seeder.profiles", profileNames),
			attribute.Bool("seeder.clean", clean),
			attribute.Int("seeder.organization_ids_count", len(organizationIDs)),
		),
	)
	defer span.End()

	// Validate and resolve profiles before touching the database.
	profiles, err := selectProfiles(allProfiles, profileNames)
	if err != nil {
		writeAvailableProfiles(os.Stderr, allProfiles, "\n")
		return err
	}

	slog.Info("🚀 Kaiten Seeder", "profiles", profileNames, "clean", clean, "organization_ids", organizationIDs)

	// Reset database once before the first profile (if requested).
	if clean {
		if err := seeder.ResetDatabase(cfg.Database.ConnectionString); err != nil {
			return fmt.Errorf("error resetting database: %w", err)
		}
	} else {
		slog.Warn("⚠️  Running without --clean flag. Existing data may cause errors.")
		slog.Warn("   Use --clean/-c to reset the database before seeding.")
	}

	// Connect to database with a larger pool — the seeder runs many concurrent
	// use-case calls across 4 orgs and needs more than the default 4 connections.
	pool, err := database.ConnectDBWithMaxConns(cfg.Database.ConnectionString, 150)
	if err != nil {
		return fmt.Errorf("error connecting to database: %w", err)
	}
	defer pool.Close()
	slog.Info("🔌 DB pool configured", "max_conns", pool.Config().MaxConns)

	// kaiten-admin-tools runs the migrations, ahead of everything else.
	// --clean reruns them as part of ResetDatabase, so this check only matters
	// on the non-clean path.
	if !clean {
		current, err := database.IsSchemaCurrent(ctx, pool)
		if err != nil {
			return fmt.Errorf("error checking schema version: %w", err)
		}
		if !current {
			return errors.New("database schema is not up to date: run kaiten-admin-tools migrate up")
		}
	}

	var usageReporter services.UsageReporter
	if cfg.Metered.Enabled {
		// uuid.Nil means no platform organization to exempt, and the reporter
		// spells that as an empty OrgID -- it refuses the nil uuid written out,
		// on the grounds that omitting an id and writing down a fake one are
		// different intents.
		organizationID, err := cfg.Metered.ResolvePlatformOrgID()
		if err != nil {
			return fmt.Errorf("resolve dogfooding organization: %w", err)
		}
		var selfOrgID string
		if organizationID != uuid.Nil {
			selfOrgID = organizationID.String()
		}
		reporter, err := dogfooding.NewReporter(ctx, dogfooding.Config{
			APIURL: cfg.Metered.APIURL,
			OrgID:  selfOrgID,
		}, cfg.Metered.TokenFile)
		if err != nil {
			return fmt.Errorf("initialize seeder dogfooding reporter: %w", err)
		}
		defer reporter.Close()
		// Seeding must never abort because a tracked instance reached a finite
		// dogfooding cap — report usage, but swallow threshold enforcement.
		usageReporter = seeder.NonEnforcing(reporter)
	}

	if err := seeder.Run(ctx, pool, profiles, seeder.RunOptions{
		OrganizationIDs: organizationIDs,
		UsageReporter:   usageReporter,
	}); err != nil {
		return fmt.Errorf("error seeding profiles: %w", err)
	}

	return nil
}

// selectProfiles resolves profile names to Profile instances from the given list.
func selectProfiles(all []seeder.Profile, names []string) ([]seeder.Profile, error) {
	idx := make(map[string]seeder.Profile, len(all))
	for _, p := range all {
		idx[p.Name()] = p
	}
	result := make([]seeder.Profile, 0, len(names))
	for _, name := range names {
		p, ok := idx[name]
		if !ok {
			return nil, fmt.Errorf("seeder: profile %q not found", name)
		}
		result = append(result, p)
	}
	return result, nil
}

func parseOrganizationIDs(values []string) ([]uuid.UUID, error) {
	organizationIDs := make([]uuid.UUID, 0, len(values))
	for _, value := range values {
		organizationID, err := uuid.Parse(value)
		if err != nil {
			return nil, fmt.Errorf("invalid organization ID %s: %w", strconv.Quote(value), err)
		}
		organizationIDs = append(organizationIDs, organizationID)
	}

	return organizationIDs, nil
}

// devTokenEntry is the JSON shape written to tokens.json and consumed by the
// frontend user-switcher UI.
type devTokenEntry struct {
	UserID   string `json:"user_id"`
	UserName string `json:"user_name"`
	Email    string `json:"email"`
	OrgID    string `json:"org_id"`
	OrgName  string `json:"org_name"`
	// OrgExternalID is the auth-provider org id ("org_dogfooding", "org_tmnt_hq"…).
	// The internal OrgID above is derived from it (externalid.DeriveOrganizationID),
	// so it moves whenever the derivation does. Consumers that need to
	// recognise a specific org must match on this, the stable half of the pair,
	// and never on a UUID they hold a copy of.
	OrgExternalID string `json:"org_external_id"`
	Token         string `json:"token"`
}

func buildTokensCmd() *cobra.Command {
	var outPath string
	var context string

	cmd := &cobra.Command{
		Use:   "tokens",
		Short: "Generate dev HS256 JWT tokens and write them to a JSON file",
		Long: `Generates one JWT per (user, org) pair for the given --context and writes
the result to --out (default: dev/tokens.json).

--context oss (default) covers the OSS-only local stack: the shared TMNT
identities on the Kaiten Sushi Shop org (see profiles/demo.TokenTargets).
--context saas covers the SaaS local stack: the same identities on Kaiten
(Dogfooding) and Demo Sandbox (see profiles/saas.TokenTargets).

Requires KAITEN_DEV_JWT_SECRET environment variable.
No database connection is needed — tokens are derived from static profile data.`,
		RunE: func(_ *cobra.Command, _ []string) error {
			return runTokens(outPath, context)
		},
	}

	cmd.Flags().StringVar(&outPath, "out", "dev/tokens.json", "Output path for the generated tokens JSON file")
	cmd.Flags().StringVar(&context, "context", "oss", `Which local stack context to generate tokens for: "oss" or "saas"`)
	return cmd
}

func runTokens(outPath, context string) error {
	secret := os.Getenv("KAITEN_DEV_JWT_SECRET")
	if secret == "" {
		return errors.New("KAITEN_DEV_JWT_SECRET environment variable is required")
	}

	var targets []seedkit.TokenTarget
	switch context {
	case "oss":
		targets = demoprofile.TokenTargets()
	case "saas":
		targets = saasprofile.TokenTargets()
	default:
		return fmt.Errorf(`unknown --context %q: must be "oss" or "saas"`, context)
	}

	var entries []devTokenEntry
	for _, target := range targets {
		for _, user := range target.Users {
			claims := jwtutil.DevClaims(
				user.ExternalID, user.Email, user.Name,
				target.Org.ExternalID, target.Org.Name,
				[]string{"read:*", "write:*"},
			)
			token, err := jwtutil.SignHS256([]byte(secret), claims)
			if err != nil {
				return fmt.Errorf("generate token for user %s: %w", user.ID.String(), err)
			}
			entries = append(entries, devTokenEntry{
				UserID:        user.ID.String(),
				UserName:      user.Name,
				Email:         user.Email,
				OrgID:         target.Org.ID.String(),
				OrgName:       target.Org.Name,
				OrgExternalID: target.Org.ExternalID,
				Token:         token,
			})
		}
	}

	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal tokens: %w", err)
	}

	if dir := filepath.Dir(outPath); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("create output directory: %w", err)
		}
	}

	if err := atomicfile.Write(outPath, data, 0o600); err != nil {
		return fmt.Errorf("write tokens file: %w", err)
	}

	slog.Info("dev tokens written", "path", outPath, "context", context, "count", len(entries))
	return nil
}

func writeAvailableProfiles(out io.Writer, profiles []seeder.Profile, prefix string) {
	if prefix != "" {
		_, _ = io.WriteString(out, prefix)
	}

	_, _ = io.WriteString(out, "Available profiles:\n")

	sorted := make([]seeder.Profile, len(profiles))
	copy(sorted, profiles)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Name() < sorted[j].Name() })

	var builder strings.Builder
	for _, p := range sorted {
		builder.WriteString("  - ")
		builder.WriteString(p.Name())
		builder.WriteString(": ")
		builder.WriteString(p.Description())
		builder.WriteString("\n")
	}

	_, _ = io.WriteString(out, builder.String())
}
