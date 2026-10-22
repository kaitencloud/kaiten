package storage

import (
	"context"
	"fmt"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
)

// Roles returns current-org definitions plus immutable system templates.
func (s *Store) Roles(ctx context.Context, orgID uuid.UUID) ([]schema.Role, error) {
	rows, err := db.New(s.uof.DBTX(ctx)).ListOrganizationRoles(ctx, orgID)
	if err != nil {
		return nil, err
	}
	roles := schema.RoleTemplates()
	for _, row := range rows {
		roles = append(roles, schema.Role{Slug: row.Slug, Name: row.Name, Description: row.Description, Permissions: append([]string{}, row.Permissions...)})
	}
	return roles, nil
}

func validateAssignment(assignment schema.UserAuthorization, roles []schema.Role) error {
	if err := assignment.Validate(); err != nil {
		return fmt.Errorf("%w: %s", ErrInvalidAuthorization, err)
	}
	for _, slug := range assignment.Roles {
		index := slices.IndexFunc(roles, func(role schema.Role) bool { return role.Slug == slug })
		if index < 0 {
			return fmt.Errorf("%w: unknown organization role %q", ErrInvalidAuthorization, slug)
		}
		role := roles[index]
		if !role.BuiltIn {
			if err := (schema.RoleDefinition{Name: role.Name, Description: role.Description, Permissions: role.Permissions}).Validate(); err != nil {
				return fmt.Errorf("%w: %s", ErrInvalidAuthorization, err)
			}
		}
	}
	return nil
}

func (s *Store) validateAssignment(ctx context.Context, orgID uuid.UUID, assignment schema.UserAuthorization) error {
	roles, err := s.Roles(ctx, orgID)
	if err != nil {
		return err
	}
	return validateAssignment(assignment, roles)
}

// ResolveGrants reloads role definitions every request, never JWT grants or a
// cache. Explicit permissions stay separate from expanded role permissions.
func (s *Store) ResolveGrants(ctx context.Context, orgID, userID uuid.UUID) ([]string, error) {
	row, err := db.New(s.uof.DBTX(ctx)).ResolveUserAuthorization(ctx, db.ResolveUserAuthorizationParams{OrganizationID: orgID, UserID: userID})
	if err != nil {
		return nil, err
	}
	roles, err := s.Roles(ctx, orgID)
	if err != nil {
		return nil, err
	}
	assignment := schema.UserAuthorization{Enabled: row.Enabled, Roles: row.Roles, Permissions: row.Permissions}
	if err := validateAssignment(assignment, roles); err != nil {
		return nil, err
	}
	return assignment.EffectiveScopes(roles...), nil
}

func (s *Store) CreateRole(ctx context.Context, orgID, actorID uuid.UUID, input schema.CreateRole) (schema.Role, error) {
	var result schema.Role
	err := s.uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(s.uof.DBTX(ctx))
		grants, err := s.lockManager(ctx, q, orgID, actorID)
		if err != nil {
			return err
		}
		if slices.Contains(schema.BuiltInRoles(), input.Slug) {
			return ErrBuiltInRole
		}
		if !schema.ValidRoleSlug(input.Slug) {
			return fmt.Errorf("%w: invalid role slug", ErrInvalidAuthorization)
		}
		if err := input.Validate(); err != nil {
			return fmt.Errorf("%w: %s", ErrInvalidAuthorization, err)
		}
		if err := requireAuthority(grants, input.Permissions); err != nil {
			return err
		}
		row, err := q.CreateOrganizationRole(ctx, db.CreateOrganizationRoleParams{OrganizationID: orgID, Slug: input.Slug, Name: input.Name, Description: input.Description, Permissions: append([]string{}, input.Permissions...)})
		result = schema.Role{Slug: row.Slug, Name: row.Name, Description: row.Description, Permissions: append([]string{}, row.Permissions...)}
		return err
	})
	return result, err
}

func (s *Store) UpdateRole(ctx context.Context, orgID, actorID uuid.UUID, slug string, input schema.RoleDefinition) (schema.Role, error) {
	var result schema.Role
	err := s.uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(s.uof.DBTX(ctx))
		grants, err := s.lockManager(ctx, q, orgID, actorID)
		if err != nil {
			return err
		}
		if slices.Contains(schema.BuiltInRoles(), slug) {
			return ErrBuiltInRole
		}
		if err := input.Validate(); err != nil {
			return fmt.Errorf("%w: %s", ErrInvalidAuthorization, err)
		}
		if err := s.requireRoleAuthority(ctx, orgID, slug, grants); err != nil {
			return err
		}
		if err := requireAuthority(grants, input.Permissions); err != nil {
			return err
		}
		roles, err := s.Roles(ctx, orgID)
		if err != nil {
			return err
		}
		proposed := append([]schema.Role{}, roles...)
		index := slices.IndexFunc(proposed, func(role schema.Role) bool { return role.Slug == slug })
		proposed[index].Permissions = input.Permissions
		assignees, err := q.ListRoleUserAuthorizations(ctx, db.ListRoleUserAuthorizationsParams{OrganizationID: orgID, Slug: slug})
		if err != nil {
			return err
		}
		for _, assignee := range assignees {
			assignment := schema.UserAuthorization{Enabled: assignee.Enabled, Roles: assignee.Roles, Permissions: assignee.Permissions}
			if err := requireAssignmentAuthority(grants, assignment, roles); err != nil {
				return err
			}
			if err := requireAssignmentAuthority(grants, assignment, proposed); err != nil {
				return err
			}
		}
		row, err := q.UpdateOrganizationRole(ctx, db.UpdateOrganizationRoleParams{OrganizationID: orgID, Slug: slug, Name: input.Name, Description: input.Description, Permissions: append([]string{}, input.Permissions...)})
		result = schema.Role{Slug: row.Slug, Name: row.Name, Description: row.Description, Permissions: append([]string{}, row.Permissions...)}
		return err
	})
	return result, err
}

func (s *Store) DeleteRole(ctx context.Context, orgID, actorID uuid.UUID, slug string) error {
	return s.uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(s.uof.DBTX(ctx))
		grants, err := s.lockManager(ctx, q, orgID, actorID)
		if err != nil {
			return err
		}
		if slices.Contains(schema.BuiltInRoles(), slug) {
			return ErrBuiltInRole
		}
		if err := s.requireRoleAuthority(ctx, orgID, slug, grants); err != nil {
			return err
		}
		assigned, err := q.OrganizationRoleAssigned(ctx, db.OrganizationRoleAssignedParams{OrganizationID: orgID, Slug: slug})
		if err != nil {
			return err
		}
		if assigned {
			return ErrRoleInUse
		}
		count, err := q.DeleteOrganizationRole(ctx, db.DeleteOrganizationRoleParams{OrganizationID: orgID, Slug: slug})
		if err != nil {
			return err
		}
		if count == 0 {
			return pgx.ErrNoRows
		}
		return nil
	})
}

// SetEnabled preserves the latest roles and explicit permissions under the same
// organization lock as assignment/role writes. No stale read/replace race.
func (s *Store) SetEnabled(ctx context.Context, orgID, actorID, userID uuid.UUID, enabled bool) (schema.UserAuthorization, error) {
	var result schema.UserAuthorization
	err := s.uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(s.uof.DBTX(ctx))
		if _, err := s.lockManager(ctx, q, orgID, actorID); err != nil {
			return err
		}
		row, err := q.GetOrganizationUser(ctx, db.GetOrganizationUserParams{OrganizationID: orgID, UserID: userID})
		if err != nil {
			return err
		}
		result, err = s.ReplaceAuthorization(ctx, orgID, actorID, userID, schema.UserAuthorization{Enabled: enabled, Roles: row.Roles, Permissions: row.Permissions})
		return err
	})
	return result, err
}

// SetAssignments reads enablement only after the shared lock. A role edit cannot
// silently undo another manager's concurrent disablement.
func (s *Store) SetAssignments(ctx context.Context, orgID, actorID, userID uuid.UUID, input schema.UserRoleAssignments) (schema.UserAuthorization, error) {
	var result schema.UserAuthorization
	err := s.uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(s.uof.DBTX(ctx))
		if _, err := s.lockManager(ctx, q, orgID, actorID); err != nil {
			return err
		}
		row, err := q.GetOrganizationUser(ctx, db.GetOrganizationUserParams{OrganizationID: orgID, UserID: userID})
		if err != nil {
			return err
		}
		result, err = s.ReplaceAuthorization(ctx, orgID, actorID, userID, schema.UserAuthorization{Enabled: row.Enabled, Roles: input.Roles, Permissions: input.Permissions})
		return err
	})
	return result, err
}

// A role editor must cover retained permissions too, even for metadata-only
// updates or deletion. Otherwise a limited manager could launder a broader role.
func (s *Store) requireRoleAuthority(ctx context.Context, orgID uuid.UUID, slug string, grants []string) error {
	roles, err := s.Roles(ctx, orgID)
	if err != nil {
		return err
	}
	index := slices.IndexFunc(roles, func(role schema.Role) bool { return role.Slug == slug })
	if index < 0 {
		return pgx.ErrNoRows
	}
	return requireAuthority(grants, roles[index].Permissions)
}
