package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/spf13/cobra"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createplatformtoken"
	identityschema "github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

func buildPlatformTokenCmd() *cobra.Command {
	platformTokenCmd := &cobra.Command{
		Use:   "platform-token",
		Short: "Manage platform credentials for the system:kaiten identity",
		Long: `Manage platform credentials (` + token.PrefixPlatform + `...) for the system:kaiten identity.

A platform credential authenticates the platform itself and carries no
organization execution context: it reaches the Platform API at /api/platform/**
and nothing else. To act inside a tenant it mints an ordinary organization token
from system:kaiten's existing membership there - see ` + "`service-token mint`" + ` and
POST /api/platform/organizations/{orgId}/tokens.

A platform credential cannot mint or rotate another one. This binary is the only
issuer, and that is a property of the design rather than of the deployment: the
three use cases behind these commands have no endpoint and could not acquire one,
because an API that authenticates with a platform credential cannot be what issues
the first, and naming somebody else's credential in order to list or revoke it is
the cross-credential enumeration the Platform API exists to refuse.`,
	}

	platformTokenCmd.AddCommand(buildPlatformTokenCreateCmd())
	platformTokenCmd.AddCommand(buildPlatformTokenListCmd())
	platformTokenCmd.AddCommand(buildPlatformTokenRevokeCmd())

	return platformTokenCmd
}

func buildPlatformTokenCreateCmd() *cobra.Command {
	var (
		name       string
		scopes     string
		ttl        time.Duration
		noExpiry   bool
		replace    bool
		outputFile string
	)

	cmd := &cobra.Command{
		Use:   "create",
		Short: "Create a platform credential and emit it exactly once",
		Long: `Create a platform credential and emit it exactly once.

The value is printed to stdout (and nothing else is), or written to
--output-file at 0600 with stdout left empty. Only its hash is stored, so this
is the only moment the credential exists: it cannot be recovered later, and this
command is deliberately NOT idempotent - returning success without a usable
credential would be worse than failing.

Re-running with a name that is already active fails. Pass --replace to revoke
that credential (cascading to every token it issued) and mint a fresh one, which
is what makes a repeated ` + "`task up`" + ` work.

One of --ttl or --no-expiry is required. There is no default: how long a
platform credential lives is a decision, not a fallback.

The documented starting scope set is the moved privileged operations plus
introspection and minting:

  read:organizations,delete:organizations,delete:memberships,delete:users,read:tokens,write:tokens`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			name = strings.TrimSpace(name)
			if name == "" {
				return errors.New("--name is required")
			}

			parsedScopes, err := parseScopes(scopes)
			if err != nil {
				return err
			}

			expiresAt, err := resolveExpiry(cmd, ttl, noExpiry)
			if err != nil {
				return err
			}

			app, cleanup, err := openApplication(cmd.Context())
			if err != nil {
				return err
			}
			defer cleanup()

			plaintext, err := mintPlatformToken(cmd.Context(), app, &createplatformtoken.Command{
				Name:      name,
				Scopes:    parsedScopes,
				ExpiresAt: expiresAt,
				Replace:   replace,
			})
			if err != nil {
				return err
			}

			return emitCredential(cmd.OutOrStdout(), plaintext, outputFile)
		},
	}

	cmd.Flags().StringVar(&name, "name", "", "Operator-chosen name, unique among active platform credentials (required)")
	cmd.Flags().StringVar(&scopes, "scopes", "", "Comma-separated scopes this credential carries (required)")
	cmd.Flags().DurationVar(&ttl, "ttl", 0, "How long the credential is valid, e.g. 720h")
	cmd.Flags().BoolVar(&noExpiry, "no-expiry", false, "Create a non-expiring credential, bounded only by revocation")
	cmd.Flags().BoolVar(&replace, "replace", false, "Revoke an active credential of the same name (and its children) first")
	cmd.Flags().StringVar(&outputFile, "output-file", "", "Write the credential here at 0600 instead of to stdout")
	mustCompleteFlag(cmd, "scopes", completeScopes)
	mustCompleteFlag(cmd, "name", completeActivePlatformTokenNamesFlag)

	return cmd
}

// resolveExpiry enforces "one of --ttl or --no-expiry", so neither an omitted
// flag nor a zero duration can quietly become a lifetime nobody chose.
//
// nil for --no-expiry: that is what createplatformtoken.Command.ExpiresAt reads as
// "bounded by revocation only", and it is the same nil the mint path uses for an
// omitted --ttl. The two commands differ on whether the operator must say so out
// loud, not on how the answer is spelled.
func resolveExpiry(cmd *cobra.Command, ttl time.Duration, noExpiry bool) (*time.Time, error) {
	ttlSet := cmd.Flags().Changed("ttl")

	switch {
	case ttlSet && noExpiry:
		return nil, errors.New("--ttl and --no-expiry are mutually exclusive")
	case !ttlSet && !noExpiry:
		return nil, errors.New("one of --ttl or --no-expiry is required")
	case noExpiry:
		return nil, nil
	default:
		return expiresIn(ttl)
	}
}

// mintPlatformToken issues the credential and returns its plaintext, with this
// binary's wording applied to the two refusals it re-words.
//
// A named function rather than three lines inlined in RunE, because the concurrency
// test needs to race this exact call without racing cobra: it constructs one
// application over a shared pool and calls in from several goroutines, which a RunE
// closure reachable only through root.ExecuteContext and a process-wide env var
// cannot support. Keeping the remapping on this side of the seam is what makes that
// test assert the message an operator actually sees.
func mintPlatformToken(
	ctx context.Context, app *kaiten.Kaiten, cmd *createplatformtoken.Command,
) (string, error) {
	minted, err := app.InProcess().CreatePlatformToken(ctx, cmd)
	if err != nil {
		return "", remapPlatformTokenCreate(err, cmd.Name)
	}

	return minted.Value, nil
}

func buildPlatformTokenListCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List platform credentials, including retired ones",
		Long: `List platform credentials, including revoked and expired ones.

Retired rows are kept deliberately - they are the audit evidence that a
credential existed and when it stopped working. The API sweeps them once they are
older than KAITEN_RETENTION_RETIRED_TOKENS (see
internal/modules/identity/tokenretention); nothing here deletes a row.

Never prints a credential or a hash; there is nothing stored that could.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			app, cleanup, err := openApplication(cmd.Context())
			if err != nil {
				return err
			}
			defer cleanup()

			tokens, err := app.InProcess().ListPlatformTokens(cmd.Context())
			if err != nil {
				return fmt.Errorf("error listing platform tokens: %w", err)
			}

			writePlatformTokenTable(cmd.OutOrStdout(), tokens)
			return nil
		},
	}
}

func writePlatformTokenTable(out io.Writer, tokens []identityschema.PlatformToken) {
	tw := tabwriter.NewWriter(out, 0, 4, 2, ' ', 0)
	_, _ = fmt.Fprintln(tw, "NAME\tID\tSCOPES\tCREATED_AT\tEXPIRES_AT\tREVOKED_AT")
	for _, row := range tokens {
		_, _ = fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t%s\t%s\n",
			row.Name, row.ID, strings.Join(row.Scopes, ","),
			row.CreatedAt.UTC().Format(time.RFC3339),
			formatInstant(row.ExpiresAt), formatInstant(row.RevokedAt))
	}
	_ = tw.Flush()
}

// formatInstant renders an optional instant for the table. "-" means there is none,
// which in the EXPIRES_AT column means non-expiring and in REVOKED_AT means still
// active.
//
// Takes the *time.Time the schema type carries rather than the column's
// pgtype.Timestamp: the two nullable columns reach this file as nil, which is the
// same absence with one fewer spelling. CREATED_AT is formatted inline above,
// because it is not nullable and passing a non-optional value through an
// optional-value formatter would invite somebody to make it one.
func formatInstant(instant *time.Time) string {
	if instant == nil {
		return "-"
	}

	return instant.UTC().Format(time.RFC3339)
}

func buildPlatformTokenRevokeCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "revoke <name>",
		Short: "Revoke a platform credential and every token it issued",
		Long: `Revoke a platform credential and every token it issued.

Revocation is soft: the row keeps its name until the API's retention sweep removes
it, and stops satisfying every lookup immediately. The cascade is the point - a
credential that minted organization tokens has to take them with it, or revoking
it would leave live tokens behind that it can no longer be held responsible for.

The parent and its children are revoked in one transaction, and each revoked
credential's cache entry is evicted from every running API instance on commit -
both properties of the use case rather than of this command, which is what makes
` + "`platform-token create --replace`" + ` get them too.`,
		Args:              cobra.ExactArgs(1),
		ValidArgsFunction: completeActivePlatformTokenNames,
		RunE: func(cmd *cobra.Command, args []string) error {
			app, cleanup, err := openApplication(cmd.Context())
			if err != nil {
				return err
			}
			defer cleanup()

			name := strings.TrimSpace(args[0])

			// The use case raises its own NotFound for a name that names no active
			// credential, worded as "no active platform token named %q" -- so there is
			// nothing to remap and, unlike --replace, nothing to treat as success.
			revoked, err := app.InProcess().RevokePlatformToken(cmd.Context(), name)
			if err != nil {
				return err
			}

			// The parent counts as one of the revoked credentials.
			_, err = fmt.Fprintf(cmd.OutOrStdout(),
				"revoked platform token %q and %d token(s) it issued\n", name, revoked-1)
			return err
		},
	}
}
