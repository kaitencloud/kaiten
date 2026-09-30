package main

import (
	"errors"
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

func buildUserCmd() *cobra.Command {
	userCmd := &cobra.Command{
		Use:   "user",
		Short: "Manage users without going through the API",
	}

	userCmd.AddCommand(buildUserDeleteCmd())

	return userCmd
}

func buildUserDeleteCmd() *cobra.Command {
	var externalID string

	cmd := &cobra.Command{
		Use:   "delete",
		Short: "Soft-delete a user",
		Long: `Soft-delete a user, by the external id the identity provider issues.

Runs the Platform API's ` + "`delete-user`" + ` operation in this process, through the same
use case the endpoint calls. The user is addressed by external id rather than by
internal uuid because that is the identifier an operator has in front of them -- a
Clerk user id out of a support ticket, not a row id -- and resolving it is a
separate step for the same reason the endpoint takes a uuid: only one of the two
identifiers is the one the domain operates on.

The soft delete leaves the row in place with deleted_at set, so every foreign key
pointing at it stays valid and the audit trail keeps naming a real user. Its
memberships are NOT removed: a user with no live memberships reaches nothing, and
` + "`membership delete`" + ` is the command for detaching one tenant at a time.

system:kaiten cannot be deleted. A BEFORE UPDATE trigger refuses it, and the use
case reports that refusal rather than pre-checking for it -- the invariant belongs
to the database, and a check-then-delete would be a race.

Destructive, so it is guarded the same way ` + "`migrate down-to`" + ` is: pass --yes.`,
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

			// Resolves soft-deleted users too, which is what makes "already deleted"
			// below a different answer from "no such user" -- see the resolveuser
			// package.
			userID, err := app.InProcess().ResolveUser(cmd.Context(), externalID)
			if err != nil {
				return err
			}

			if err := app.Platform().DeleteUser(cmd.Context(), localPlatform(), userID); err != nil {
				return remapUserDelete(err, externalID)
			}

			_, err = fmt.Fprintf(cmd.OutOrStdout(), "deleted user %s\t%s\n", userID, externalID)
			return err
		},
	}

	cmd.Flags().StringVar(&externalID, "external-id", "",
		"The user's external id, as the identity provider issues it (required)")
	addConfirmFlag(cmd)
	mustCompleteFlag(cmd, "external-id", completeUserExternalIDs)

	return cmd
}

// confirmed enforces the --yes opt-in every destructive command carries.
//
// One flag, not the two `migrate down-to` demands: a down migration can destroy a
// whole schema from a copy-pasted runbook line, while these commands name one row
// each and refuse to touch the platform identity. The flag is still required,
// because "delete" reads the same in a shell history whether it was meant or not.
func confirmed(cmd *cobra.Command) error {
	yes, err := cmd.Flags().GetBool("yes")
	if err != nil {
		return err
	}
	if !yes {
		return errors.New("refusing to delete without confirmation: pass --yes")
	}

	return nil
}

func addConfirmFlag(cmd *cobra.Command) {
	cmd.Flags().Bool("yes", false, "Confirm this destructive operation")
}
