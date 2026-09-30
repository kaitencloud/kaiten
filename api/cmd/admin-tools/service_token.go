package main

import (
	"errors"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/mintorganizationtoken"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

func buildServiceTokenCmd() *cobra.Command {
	serviceTokenCmd := &cobra.Command{
		Use:   "service-token",
		Short: "Mint organization credentials for the system:kaiten identity",
	}

	serviceTokenCmd.AddCommand(buildServiceTokenMintCmd())

	return serviceTokenCmd
}

func buildServiceTokenMintCmd() *cobra.Command {
	var (
		organizationExternalID string
		name                   string
		scopes                 string
		ttl                    time.Duration
		replace                bool
		outputFile             string
	)

	cmd := &cobra.Command{
		Use:   "mint",
		Short: "Mint an organization credential for system:kaiten inside one organization",
		Long: `Mint an ordinary organization credential (` + token.PrefixOrganization + `...) owned by
system:kaiten inside one organization.

Runs the Platform API's ` + "`mint-organization-token`" + ` operation in this process: the same
use case POST /api/platform/organizations/{orgId}/tokens calls, reached through the
application rather than over HTTP. That is what makes bootstrapping possible - the
credential a stack needs before the API is listening is minted by a binary that
needs nothing but Postgres, and it is the same credential, carrying the same
issuance event, that the endpoint would have written.

The organization must already exist (see ` + "`organization ensure`" + `) and system:kaiten
must already be a member of it. The membership is resolved inside the INSERT and
is never created here: a missing one is a platform invariant breach - the
membership trigger should have created it - not something to paper over.

The credential is minted with no parent platform token, because there is none in
hand. It is therefore outside every platform-token revocation cascade, which is
what keeps a bootstrap credential alive when whatever platform credential existed
at the time is rotated. Revoke it by name, or delete the organization.

--ttl is optional. Omitted, the credential does not expire and is bounded only by
revocation. That is what the dogfooding token already is today.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			organizationExternalID = strings.TrimSpace(organizationExternalID)
			if organizationExternalID == "" {
				return errors.New("--org is required")
			}

			name = strings.TrimSpace(name)
			if name == "" {
				return errors.New("--name is required")
			}

			parsedScopes, err := parseScopes(scopes)
			if err != nil {
				return err
			}

			// The duration goes to the use case as the string it declares, unparsed and
			// unvalidated. Deliberately unlike `platform-token create`, which validates
			// its own --ttl: that command's use case takes an instant, so nobody else
			// could. This one owns "ttl must be positive; omit it to mint a
			// non-expiring credential" as part of a wire contract, and re-stating it
			// here would be a second copy of a rule that only ever gets to disagree.
			// An unparseable duration cannot reach it - cobra rejects one at flag-parse
			// time.
			ttlValue := ""
			if cmd.Flags().Changed("ttl") {
				ttlValue = ttl.String()
			}

			app, cleanup, err := openApplication(cmd.Context())
			if err != nil {
				return err
			}
			defer cleanup()

			// Both callers, in the order the operation needs them. Resolving an external
			// id to a uuid is the cross-tenant read no credential can perform, so it goes
			// through InProcess; the mint itself is a published Platform API operation,
			// so it goes through the platform caller and gets that surface's
			// authorization, target resolution and issuance event.
			organizationID, err := resolveOrganizationID(cmd.Context(), app, organizationExternalID)
			if err != nil {
				return err
			}

			minted, err := app.Platform().MintOrganizationToken(
				cmd.Context(), localPlatform(), organizationID, &mintorganizationtoken.Command{
					Name:    name,
					Scopes:  parsedScopes,
					TTL:     ttlValue,
					Replace: replace,
				})
			if err != nil {
				return remapOrganizationTokenMint(err, name, organizationExternalID)
			}

			return emitCredential(cmd.OutOrStdout(), minted.Value, outputFile)
		},
	}

	cmd.Flags().StringVar(&organizationExternalID, "org", "", "External id of the organization to mint into (required)")
	cmd.Flags().StringVar(&name, "name", "", "Operator-chosen name, unique among this organization's active system:kaiten tokens (required)")
	cmd.Flags().StringVar(&scopes, "scopes", "", "Comma-separated scopes this credential carries (required)")
	cmd.Flags().DurationVar(&ttl, "ttl", 0, "How long the credential is valid; omitted means non-expiring")
	cmd.Flags().BoolVar(&replace, "replace", false, "Revoke an active credential of the same name in this organization first")
	cmd.Flags().StringVar(&outputFile, "output-file", "", "Write the credential here at 0600 instead of to stdout")
	mustCompleteFlag(cmd, "org", completeOrganizationExternalIDs)
	mustCompleteFlag(cmd, "scopes", completeScopes)

	return cmd
}
