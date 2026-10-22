package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"
	"text/tabwriter"

	"github.com/google/uuid"
	"github.com/spf13/cobra"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// userContext names a tenant and a real acting human. Static supplies only the
// adapter's operation scopes; Users still freshly checks the human actor's stored
// users scopes (and rechecks grants under the organization lock on writes).
// Database access is not an implicit recovery grant on this command surface.
type userContext struct {
	organizationExternalID string
	organizationID         string
	actorExternalID        string
	json                   bool
}

func (o *userContext) flags(cmd *cobra.Command) {
	cmd.Flags().StringVar(&o.organizationExternalID, "organization-external-id", "", "Organization external id (or use --organization-id)")
	cmd.Flags().StringVar(&o.organizationID, "organization-id", "", "Organization UUID (or use --organization-external-id)")
	cmd.Flags().StringVar(&o.actorExternalID, "actor-external-id", "", "Acting enabled human member's external id (requires stored users permission)")
	cmd.Flags().BoolVar(&o.json, "json", false, "Print JSON instead of a plain table")
	mustCompleteFlag(cmd, "organization-external-id", completeOrganizationExternalIDs)
	mustCompleteFlag(cmd, "actor-external-id", completeUserExternalIDs)
}

func (o *userContext) validate() error {
	o.organizationExternalID = strings.TrimSpace(o.organizationExternalID)
	o.organizationID = strings.TrimSpace(o.organizationID)
	o.actorExternalID = strings.TrimSpace(o.actorExternalID)
	if (o.organizationExternalID == "") == (o.organizationID == "") {
		return errors.New("specify exactly one of --organization-external-id or --organization-id")
	}
	if o.organizationID != "" {
		id, err := uuid.Parse(o.organizationID)
		if err != nil || id == uuid.Nil {
			return errors.New("--organization-id must be a non-zero UUID")
		}
	}
	if o.actorExternalID == "" {
		return errors.New("--actor-external-id is required")
	}
	return nil
}

func (o *userContext) open(ctx context.Context, scopes ...string) (*kaiten.Kaiten, caller.OrganizationCaller, func(), error) {
	app, cleanup, err := openApplication(ctx)
	if err != nil {
		return nil, caller.OrganizationCaller{}, nil, err
	}
	orgID, err := uuid.Parse(o.organizationID)
	if o.organizationExternalID != "" {
		orgID, err = resolveOrganizationID(ctx, app, o.organizationExternalID)
	}
	if err != nil {
		cleanup()
		return nil, caller.OrganizationCaller{}, nil, err
	}
	actorID, err := app.InProcess().ResolveUser(ctx, o.actorExternalID)
	if err != nil {
		cleanup()
		return nil, caller.OrganizationCaller{}, nil, fmt.Errorf("resolve acting human: %w", err)
	}
	return app, caller.Static(actorID, orgID, scopes), cleanup, nil
}

func addUserTargetFlag(cmd *cobra.Command, externalID *string) {
	cmd.Flags().StringVar(externalID, "external-id", "", "Target user's identity-provider external id (required)")
	mustCompleteFlag(cmd, "external-id", completeUserExternalIDs)
}

func validateUserTarget(externalID *string) error {
	*externalID = strings.TrimSpace(*externalID)
	if *externalID == "" {
		return errors.New("--external-id is required")
	}
	return nil
}

func confirmAccessChange(cmd *cobra.Command) error {
	yes, err := cmd.Flags().GetBool("yes")
	if err != nil {
		return err
	}
	if !yes {
		return errors.New("refusing to change access without confirmation: pass --yes")
	}
	return nil
}

func buildUserListCmd() *cobra.Command {
	var o userContext
	var limit int32
	var cursor string
	cmd := &cobra.Command{
		Use: "list", Short: "List human members and assignments in one organization", Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if err := o.validate(); err != nil {
				return err
			}
			if limit < 1 || limit > pagination.MaxLimit {
				return fmt.Errorf("--limit must be between 1 and %d", pagination.MaxLimit)
			}
			app, cl, cleanup, err := o.open(cmd.Context(), scope.Read(scope.Users))
			if err != nil {
				return err
			}
			defer cleanup()
			var after *string
			if cursor != "" {
				after = &cursor
			}
			page, err := app.Users().ListUsers(cmd.Context(), cl, limit, after)
			if err != nil {
				return err
			}
			if o.json {
				return json.NewEncoder(cmd.OutOrStdout()).Encode(page)
			}
			if err := writeUsers(cmd.OutOrStdout(), page.Items); err != nil {
				return err
			}
			if page.NextCursor != nil {
				_, err = fmt.Fprintf(cmd.OutOrStdout(), "next_cursor\t%s\n", *page.NextCursor)
			}
			return err
		},
	}
	o.flags(cmd)
	cmd.Flags().Int32Var(&limit, "limit", pagination.DefaultLimit, "Page size (1-200)")
	cmd.Flags().StringVar(&cursor, "cursor", "", "Opaque next cursor returned by the previous page")
	return cmd
}

func buildUserGetCmd() *cobra.Command {
	var o userContext
	var externalID string
	cmd := &cobra.Command{
		Use: "get", Short: "Get a human member's profile and assignment", Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if err := o.validate(); err != nil {
				return err
			}
			if err := validateUserTarget(&externalID); err != nil {
				return err
			}
			app, cl, cleanup, err := o.open(cmd.Context(), scope.Read(scope.Users))
			if err != nil {
				return err
			}
			defer cleanup()
			id, err := app.InProcess().ResolveUser(cmd.Context(), externalID)
			if err != nil {
				return err
			}
			user, err := app.Users().GetUser(cmd.Context(), cl, id)
			if err != nil {
				return err
			}
			if o.json {
				return json.NewEncoder(cmd.OutOrStdout()).Encode(user)
			}
			return writeUsers(cmd.OutOrStdout(), []schema.ManagedUser{user})
		},
	}
	o.flags(cmd)
	addUserTargetFlag(cmd, &externalID)
	return cmd
}

func buildUserUpdateCmd() *cobra.Command {
	var o userContext
	var externalID, name, email string
	cmd := &cobra.Command{
		Use: "update", Short: "Replace a human member's global name and email",
		Long: "Replace the global profile, shared by all of this user's memberships. Both --name and --email are required. The external identity is immutable; future sign-ins no longer overwrite this managed profile.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if err := o.validate(); err != nil {
				return err
			}
			if err := validateUserTarget(&externalID); err != nil {
				return err
			}
			if strings.TrimSpace(name) == "" || strings.TrimSpace(email) == "" {
				return errors.New("--name and --email are required")
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
			if err := app.Users().UpdateUser(cmd.Context(), cl, id, schema.Profile{Name: name, Email: email}); err != nil {
				return err
			}
			if o.json {
				return json.NewEncoder(cmd.OutOrStdout()).Encode(struct {
					ID      uuid.UUID `json:"id"`
					Updated bool      `json:"updated"`
				}{id, true})
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "updated user %s\t%s\n", id, externalID)
			return err
		},
	}
	o.flags(cmd)
	addUserTargetFlag(cmd, &externalID)
	cmd.Flags().StringVar(&name, "name", "", "Global display name (required)")
	cmd.Flags().StringVar(&email, "email", "", "Global email address (required)")
	return cmd
}

func buildUserAuthorizationCmd() *cobra.Command {
	var o userContext
	var externalID, roles, permissions string
	var enabled bool
	cmd := &cobra.Command{
		Use: "authorization", Aliases: []string{"grant"}, Short: "Replace all roles, explicit permissions and enabled state",
		Long: "Replace the entire organization assignment, not an additive grant. Explicit --roles, --permissions (alias --scopes), --enabled and --yes are required. Empty lists revoke those grants. Roles are slugs; custom role existence and scopes are validated by the users module. The last enabled administrator cannot be demoted or disabled.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if err := o.validate(); err != nil {
				return err
			}
			if err := validateUserTarget(&externalID); err != nil {
				return err
			}
			if !cmd.Flags().Changed("roles") || !cmd.Flags().Changed("enabled") ||
				(!cmd.Flags().Changed("permissions") && !cmd.Flags().Changed("scopes")) {
				return errors.New("--roles, --permissions (or --scopes) and --enabled must all be explicit; use an empty string to clear a list")
			}
			if cmd.Flags().Changed("permissions") && cmd.Flags().Changed("scopes") {
				return errors.New("specify only one of --permissions or --scopes")
			}
			if err := confirmAccessChange(cmd); err != nil {
				return err
			}
			assignment := schema.UserAuthorization{Enabled: enabled, Roles: parseUserCSV(roles), Permissions: parseUserCSV(permissions)}
			// Do not validate role slugs against a local built-in list: custom
			// roles are organization-owned and the module resolves them freshly.
			if err := validateUserPermissions(assignment.Permissions); err != nil {
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
			result, err := app.Users().PutUserAuthorization(cmd.Context(), cl, id, assignment)
			if err != nil {
				return err
			}
			return writeUserAuthorization(cmd, o.json, externalID, result)
		},
	}
	o.flags(cmd)
	addUserTargetFlag(cmd, &externalID)
	cmd.Flags().StringVar(&roles, "roles", "", "Complete comma-separated role slugs; empty clears roles (required)")
	cmd.Flags().StringVar(&permissions, "permissions", "", "Complete comma-separated explicit organization permissions; empty clears (required)")
	cmd.Flags().StringVar(&permissions, "scopes", "", "Alias for --permissions")
	cmd.Flags().BoolVar(&enabled, "enabled", true, "Explicit enabled state, e.g. --enabled=false (required)")
	mustCompleteFlag(cmd, "permissions", completeUserPermissions)
	mustCompleteFlag(cmd, "scopes", completeUserPermissions)
	addConfirmFlag(cmd)
	return cmd
}

func parseUserCSV(csv string) []string {
	values := []string{}
	for value := range strings.SplitSeq(csv, ",") {
		value = strings.TrimSpace(value)
		if value != "" && !slices.Contains(values, value) {
			values = append(values, value)
		}
	}
	return values
}

func validateUserPermissions(permissions []string) error {
	allowed := scope.OrganizationScopes()
	for _, permission := range permissions {
		if !slices.Contains(allowed, permission) {
			return fmt.Errorf("invalid organization permission: %q", permission)
		}
	}
	return nil
}

func writeUserAuthorization(cmd *cobra.Command, asJSON bool, externalID string, a schema.UserAuthorization) error {
	if asJSON {
		return json.NewEncoder(cmd.OutOrStdout()).Encode(a)
	}
	tw := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 4, 2, ' ', 0)
	_, _ = fmt.Fprintln(tw, "EXTERNAL_ID\tENABLED\tROLES\tPERMISSIONS")
	_, _ = fmt.Fprintf(tw, "%s\t%t\t%s\t%s\n", externalID, a.Enabled, strings.Join(a.Roles, ","), strings.Join(a.Permissions, ","))
	return tw.Flush()
}

func writeUsers(out io.Writer, users []schema.ManagedUser) error {
	tw := tabwriter.NewWriter(out, 0, 4, 2, ' ', 0)
	_, _ = fmt.Fprintln(tw, "ID\tEXTERNAL_ID\tNAME\tEMAIL\tENABLED\tROLES\tPERMISSIONS")
	for _, user := range users {
		email := ""
		if user.Email != nil {
			email = *user.Email
		}
		_, _ = fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t%t\t%s\t%s\n", user.ID, user.ExternalID, user.Name, email, user.Authorization.Enabled, strings.Join(user.Authorization.Roles, ","), strings.Join(user.Authorization.Permissions, ","))
	}
	return tw.Flush()
}
