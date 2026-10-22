package main

import (
	"github.com/spf13/cobra"

	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

func buildUserEnabledCmd(enabled bool) *cobra.Command {
	var o userContext
	var externalID string
	verb := "disable"
	if enabled {
		verb = "enable"
	}
	cmd := &cobra.Command{
		Use: verb, Short: verb + " a human member in one organization",
		Long: verb + " a human member's organization access without changing their latest roles or permissions. This does not delete the global user or remove memberships. Requires an enabled stored administrator and --yes; the last enabled administrator cannot be disabled.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if err := o.validate(); err != nil {
				return err
			}
			if err := validateUserTarget(&externalID); err != nil {
				return err
			}
			if err := confirmAccessChange(cmd); err != nil {
				return err
			}
			app, cl, cleanup, err := o.open(cmd.Context(), scope.Write(scope.Users))
			if err != nil {
				return err
			}
			defer cleanup()
			id, err := app.InProcess().ResolveUser(cmd.Context(), externalID)
			if err != nil {
				return err
			}
			// The usecase changes only enabled under the organization lock; a
			// read/replace round-trip could restore concurrently revoked grants.
			result, err := app.Users().SetUserEnabled(cmd.Context(), cl, id, enabled)
			if err != nil {
				return err
			}
			return writeUserAuthorization(cmd, o.json, externalID, result)
		},
	}
	o.flags(cmd)
	addUserTargetFlag(cmd, &externalID)
	addConfirmFlag(cmd)
	return cmd
}
