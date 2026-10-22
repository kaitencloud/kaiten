package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

func buildRoleCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use: "role", Aliases: []string{"roles"}, Short: "Manage organization-owned scope-group roles",
		Long: "Manage custom roles as an enabled stored organization administrator. Role slugs are immutable assignment identifiers. Built-in roles, including administrator, cannot be edited or deleted; custom roles never confer administrator status. Scope-group changes immediately affect every member assigned the role.",
	}
	cmd.AddCommand(buildRoleListCmd(), buildRoleWriteCmd(false), buildRoleWriteCmd(true), buildRoleDeleteCmd())
	return cmd
}

func buildRoleListCmd() *cobra.Command {
	var o userContext
	cmd := &cobra.Command{
		Use: "list", Short: "List built-in and custom scope-group roles", Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if err := o.validate(); err != nil {
				return err
			}
			app, cl, cleanup, err := o.open(cmd.Context(), scope.Read(scope.Users))
			if err != nil {
				return err
			}
			defer cleanup()
			roles, err := app.Users().ListRoles(cmd.Context(), cl)
			if err != nil {
				return err
			}
			return writeRoles(cmd, o.json, roles)
		},
	}
	o.flags(cmd)
	return cmd
}

func buildRoleWriteCmd(update bool) *cobra.Command {
	var o userContext
	var slug, name, description, permissions string
	verb := "create"
	if update {
		verb = "update"
	}
	cmd := &cobra.Command{
		Use: verb, Short: verb + " a custom scope-group role (complete replacement)",
		Long: "Write a custom scope-group role. --slug, --name, --description and --permissions (alias --scopes) are all explicit; an empty description or permissions list is allowed. Updates replace the entire role definition and affect every assigned user. Requires --yes. Built-in roles are immutable.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if err := o.validate(); err != nil {
				return err
			}
			slug, name = strings.TrimSpace(slug), strings.TrimSpace(name)
			if slug == "" || name == "" || !cmd.Flags().Changed("description") ||
				(!cmd.Flags().Changed("permissions") && !cmd.Flags().Changed("scopes")) {
				return errors.New("--slug, --name, --description and --permissions (or --scopes) must all be explicit")
			}
			if cmd.Flags().Changed("permissions") && cmd.Flags().Changed("scopes") {
				return errors.New("specify only one of --permissions or --scopes")
			}
			if err := confirmAccessChange(cmd); err != nil {
				return err
			}
			input := schema.RoleDefinition{Name: name, Description: description, Permissions: parseUserCSV(permissions)}
			if err := validateUserPermissions(input.Permissions); err != nil {
				return err
			}
			app, cl, cleanup, err := o.open(cmd.Context(), scope.Write(scope.Users))
			if err != nil {
				return err
			}
			defer cleanup()
			var role schema.Role
			if update {
				role, err = app.Users().UpdateRole(cmd.Context(), cl, slug, input)
			} else {
				role, err = app.Users().CreateRole(cmd.Context(), cl, schema.CreateRole{Slug: slug, RoleDefinition: input})
			}
			if err != nil {
				return err
			}
			if o.json {
				return json.NewEncoder(cmd.OutOrStdout()).Encode(role)
			}
			return writeRoles(cmd, false, []schema.Role{role})
		},
	}
	o.flags(cmd)
	cmd.Flags().StringVar(&slug, "slug", "", "Immutable custom role slug (required)")
	cmd.Flags().StringVar(&name, "name", "", "Role display name (required)")
	cmd.Flags().StringVar(&description, "description", "", "Complete description; empty clears (required)")
	cmd.Flags().StringVar(&permissions, "permissions", "", "Complete comma-separated organization permissions; empty clears (required)")
	cmd.Flags().StringVar(&permissions, "scopes", "", "Alias for --permissions")
	mustCompleteFlag(cmd, "permissions", completeUserPermissions)
	mustCompleteFlag(cmd, "scopes", completeUserPermissions)
	addConfirmFlag(cmd)
	return cmd
}

func buildRoleDeleteCmd() *cobra.Command {
	var o userContext
	var slug string
	cmd := &cobra.Command{
		Use: "delete", Short: "Delete an unassigned custom scope-group role", Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if err := o.validate(); err != nil {
				return err
			}
			slug = strings.TrimSpace(slug)
			if slug == "" {
				return errors.New("--slug is required")
			}
			if err := confirmAccessChange(cmd); err != nil {
				return err
			}
			app, cl, cleanup, err := o.open(cmd.Context(), scope.Write(scope.Users))
			if err != nil {
				return err
			}
			defer cleanup()
			if err := app.Users().DeleteRole(cmd.Context(), cl, slug); err != nil {
				return err
			}
			if o.json {
				return json.NewEncoder(cmd.OutOrStdout()).Encode(struct {
					Slug    string `json:"slug"`
					Deleted bool   `json:"deleted"`
				}{slug, true})
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "deleted role %s\n", slug)
			return err
		},
	}
	o.flags(cmd)
	cmd.Flags().StringVar(&slug, "slug", "", "Unassigned custom role slug (required)")
	addConfirmFlag(cmd)
	return cmd
}

func writeRoles(cmd *cobra.Command, asJSON bool, roles []schema.Role) error {
	if asJSON {
		return json.NewEncoder(cmd.OutOrStdout()).Encode(roles)
	}
	tw := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 4, 2, ' ', 0)
	_, _ = fmt.Fprintln(tw, "SLUG\tNAME\tDESCRIPTION\tBUILT_IN\tADMINISTRATOR\tPERMISSIONS")
	for _, role := range roles {
		_, _ = fmt.Fprintf(tw, "%s\t%s\t%s\t%t\t%t\t%s\n", role.Slug, role.Name, role.Description, role.BuiltIn, role.IsAdministrator, strings.Join(role.Permissions, ","))
	}
	return tw.Flush()
}
