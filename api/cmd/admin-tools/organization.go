package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"text/tabwriter"

	"github.com/google/uuid"
	"github.com/spf13/cobra"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensureorganization"
)

func buildOrganizationCmd() *cobra.Command {
	organizationCmd := &cobra.Command{
		Use:   "organization",
		Short: "Manage organizations without going through the API",
	}

	organizationCmd.AddCommand(buildOrganizationEnsureCmd())
	organizationCmd.AddCommand(buildOrganizationListCmd())
	organizationCmd.AddCommand(buildOrganizationDeleteCmd())
	organizationCmd.AddCommand(buildMembershipCmd())

	return organizationCmd
}

func buildOrganizationListCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List every organization",
		Long: `List every organization: internal id, external id, name.

It exists for the operator about to run one of the destructive commands below,
who needs the external id of the tenant they mean and should not have to open a
psql session to find it. It is also what backs shell completion for --org and
--external-id, and what resolves an external id to the uuid the destructive
commands take.

There is no API operation behind this and there cannot be: a cross-tenant list is
exactly the enumeration the Platform API's invisibility rules refuse, to platform
credentials included. See the listorganizations package on why the position of the
caller -- an operator on the deployment's own database -- is what makes the
question askable here.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			app, cleanup, err := openApplication(cmd.Context())
			if err != nil {
				return err
			}
			defer cleanup()

			organizations, err := app.InProcess().ListOrganizations(cmd.Context())
			if err != nil {
				return fmt.Errorf("error listing organizations: %w", err)
			}

			tw := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 4, 2, ' ', 0)
			_, _ = fmt.Fprintln(tw, "ID\tEXTERNAL_ID\tNAME")
			for _, organization := range organizations {
				_, _ = fmt.Fprintf(tw, "%s\t%s\t%s\n",
					organization.ID, organization.ExternalID, organization.Name)
			}

			return tw.Flush()
		},
	}
}

func buildOrganizationDeleteCmd() *cobra.Command {
	var externalID string

	cmd := &cobra.Command{
		Use:   "delete",
		Short: "Delete an organization and everything it owns (destructive)",
		Long: `Delete an organization and everything it owns.

Runs the Platform API's ` + "`delete-organization`" + ` operation in this process: the same
use case the endpoint calls, reached through the application rather than over HTTP,
so the audit trail and the outbox events are the ones the endpoint would have
written. The credential is the difference and the only one -- an operator here holds
the database connection string instead of a platform token.

This is a HARD delete, and it cascades. Every one of the tables carrying an
organization_id references organization ON DELETE CASCADE, so this single
statement takes the whole tenant with it: customers, licenses, feature flags,
entitlements and their usage, instances, deployment zones, releases, components,
metadata fields, memberships, service accounts and their tokens, the audit trail
and any pending outbox events. None of it is recoverable -- without a usage ledger
the organization's usage history cannot be rebuilt by replaying events.

system:kaiten's membership goes with it, through that same cascade. That is the
one permitted way for it to go: ` + "`organization membership delete`" + ` refuses it.

Guarded behind --yes, and behind naming the tenant by its external id rather than
its uuid, so the confirmation and the target are both explicit.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			externalID = strings.TrimSpace(externalID)
			if externalID == "" {
				return errors.New("--external-id is required")
			}
			if err := confirmed(cmd); err != nil {
				return err
			}

			app, cleanup, err := openApplication(cmd.Context())
			if err != nil {
				return err
			}
			defer cleanup()

			organizationID, err := resolveOrganizationID(cmd.Context(), app, externalID)
			if err != nil {
				return err
			}

			if err := app.Platform().DeleteOrganization(
				cmd.Context(), localPlatform(), organizationID); err != nil {
				return remapOrganizationDelete(err, externalID)
			}

			_, err = fmt.Fprintf(cmd.OutOrStdout(), "deleted organization %s\t%s\n", organizationID, externalID)
			return err
		},
	}

	cmd.Flags().StringVar(&externalID, "external-id", "",
		"External id of the organization to delete (required)")
	addConfirmFlag(cmd)
	mustCompleteFlag(cmd, "external-id", completeOrganizationExternalIDs)

	return cmd
}

func buildMembershipCmd() *cobra.Command {
	membershipCmd := &cobra.Command{
		Use:   "membership",
		Short: "Manage a user's membership on an organization",
	}

	membershipCmd.AddCommand(buildMembershipDeleteCmd())

	return membershipCmd
}

func buildMembershipDeleteCmd() *cobra.Command {
	var organizationExternalID, userExternalID string

	cmd := &cobra.Command{
		Use:   "delete",
		Short: "Soft-delete one user's membership on one organization",
		Long: `Soft-delete one user's membership on one organization.

Runs the Platform API's ` + "`delete-membership`" + ` operation in this process, through the
same use case the endpoint calls -- so the membership entitlement is decremented
here exactly as it is there, which a direct UPDATE would have skipped. It detaches
the user from that one tenant and leaves the user row and every other membership
alone; ` + "`user delete`" + ` is the command for the user themselves.

system:kaiten's membership is the one it cannot remove. A BEFORE UPDATE trigger
refuses it and the use case reports that refusal; the only permitted way for that
membership to go is deleting the organization, which takes it through the foreign
key's ON DELETE CASCADE. Removing it by hand would leave the platform identity
unable to mint a credential for a tenant that still exists, because the mint
resolves an existing membership and never creates one.

Destructive, so it is guarded behind --yes.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			organizationExternalID = strings.TrimSpace(organizationExternalID)
			if organizationExternalID == "" {
				return errors.New("--org is required")
			}
			userExternalID = strings.TrimSpace(userExternalID)
			if userExternalID == "" {
				return errors.New("--user is required")
			}
			if err := confirmed(cmd); err != nil {
				return err
			}

			app, cleanup, err := openApplication(cmd.Context())
			if err != nil {
				return err
			}
			defer cleanup()

			organizationID, err := resolveOrganizationID(cmd.Context(), app, organizationExternalID)
			if err != nil {
				return err
			}

			userID, err := app.InProcess().ResolveUser(cmd.Context(), userExternalID)
			if err != nil {
				return err
			}

			if err := app.Platform().DeleteMembership(
				cmd.Context(), localPlatform(), organizationID, userID); err != nil {
				return remapMembershipDelete(err, organizationExternalID, userExternalID)
			}

			_, err = fmt.Fprintf(cmd.OutOrStdout(), "deleted membership %s in %s\n",
				userExternalID, organizationExternalID)
			return err
		},
	}

	cmd.Flags().StringVar(&organizationExternalID, "org", "",
		"External id of the organization (required)")
	cmd.Flags().StringVar(&userExternalID, "user", "",
		"External id of the user, as the identity provider issues it (required)")
	addConfirmFlag(cmd)
	mustCompleteFlag(cmd, "org", completeOrganizationExternalIDs)
	mustCompleteFlag(cmd, "user", completeUserExternalIDs)

	return cmd
}

func buildOrganizationEnsureCmd() *cobra.Command {
	var externalID, name string

	cmd := &cobra.Command{
		Use:   "ensure",
		Short: "Create an organization if it does not already exist",
		Long: `Create an organization if it does not already exist.

This is the same use case JIT provisioning runs on every authenticated request
(see internal/platform/jit): the id is derived from the external id, so the
operation is idempotent and a re-run converges on the same row rather than
creating a second tenant. One definition of "ensure this organization", called from
every place that asks it, instead of an upsert restated per driver.

It exists so a stack can be prepared before the API is listening - there is no
request to JIT-provision from at that point, and minting a credential into an
organization requires the organization to exist first. That is what this command is
for, and the only thing it is for: a caller that already holds a platform token has
` + "`POST /platform/organizations`" + ` and does not need the database connection
string this command requires.

--name is optional and only ever sets a name, never replaces one: omitted, a new
organization is named after its external id and an existing one keeps whatever
name it has.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			externalID = strings.TrimSpace(externalID)
			if externalID == "" {
				return errors.New("--external-id is required")
			}

			app, cleanup, err := openApplication(cmd.Context())
			if err != nil {
				return err
			}
			defer cleanup()

			// Not trimmed here: ensureorganization trims both fields itself, so that
			// whitespace cannot make two spellings of one tenant depending on which
			// driver called. --external-id is trimmed above only because this command
			// tests it for emptiness.
			organization, err := app.InProcess().EnsureOrganization(
				cmd.Context(), &ensureorganization.Command{
					ExternalID: externalID,
					Name:       name,
				})
			if err != nil {
				return err
			}

			_, err = fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\t%s\n",
				organization.ID, organization.ExternalID, organization.Name)
			return err
		},
	}

	cmd.Flags().StringVar(&externalID, "external-id", "", "The organization's external id, as the identity provider issues it (required)")
	cmd.Flags().StringVar(&name, "name", "", "Display name for a newly created organization; ignored if it already exists")
	// `ensure` is an upsert, so completing an existing id is exactly right for the
	// half of its job that converges on a row that is already there.
	mustCompleteFlag(cmd, "external-id", completeOrganizationExternalIDs)

	return cmd
}

// resolveOrganizationID turns the external id an operator typed into the uuid the
// use cases take, so every command reports "no such organization" instead of
// silently affecting nothing.
//
// Through the cross-tenant list, and deliberately not through
// pkg/externalid.DeriveOrganizationID: deriving produces the right id only for
// organizations this tooling or JIT created, so a tenant that predates either, or
// was created with an explicit id, would be addressed by a plausible uuid pointing
// at no row -- and the command would report it as already deleted while it sits
// there in `organization list`.
//
// Not a lookup use case of its own either. That would be a ninth entry on
// kaiten.InProcess, admitted because it was convenient rather than because no
// endpoint could exist for it, which is the one way that namespace stops being
// safe. The list is already there, is already what backs completion, and answers
// this question on the way past.
//
// The scan is over the deployment's tenant count, in a process that exits when the
// command does. If that ever stops being trivial the answer is a prefix filter on
// the query behind ListOrganizations, not a second path from external id to uuid.
func resolveOrganizationID(
	ctx context.Context, app *kaiten.Kaiten, externalID string,
) (uuid.UUID, error) {
	organizations, err := app.InProcess().ListOrganizations(ctx)
	if err != nil {
		return uuid.Nil, fmt.Errorf("error looking up organization %q: %w", externalID, err)
	}

	for _, organization := range organizations {
		if organization.ExternalID == externalID {
			return organization.ID, nil
		}
	}

	// Names the fix rather than the failure: an operator who mistyped an id and one
	// who has not created the tenant yet both arrive here, and `organization ensure`
	// is the answer to the second and harmless to run against the first.
	return uuid.Nil, fmt.Errorf(
		"organization %q does not exist - run `kaiten-admin-tools organization ensure --external-id %s` first",
		externalID, externalID,
	)
}
