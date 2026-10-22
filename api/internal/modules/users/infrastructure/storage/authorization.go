// Package storage owns validated, serialized users authorization writes. It
// authenticates no credentials and exposes no endpoint; drivers must supply a
// trusted human actor and organization. Stored operation scopes are resolved freshly.
package storage

import (
	"context"
	"errors"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

var (
	ErrInvalidAuthorization = errors.New("invalid stored or requested authorization")
	ErrBuiltInRole          = errors.New("built-in roles are immutable")
	ErrRoleInUse            = errors.New("role is assigned to users")
	ErrMissingPermission    = errors.New("missing required stored user-management permission")
	ErrCannotDelegate       = errors.New("cannot manage or delegate permissions not held")
	ErrLastAdministrator    = errors.New("cannot remove or disable the last organization administrator")
)

type Store struct{ uof *uow.UnitOfWork }

func New(uof *uow.UnitOfWork) *Store { return &Store{uof: uof} }

// Resolve returns pgx.ErrNoRows for a missing/disabled user, membership or org.
// Enabled members with no assignment have empty grants. Always resolve freshly.
func (s *Store) Resolve(ctx context.Context, organizationID, userID uuid.UUID) (schema.UserAuthorization, error) {
	row, err := db.New(s.uof.DBTX(ctx)).ResolveUserAuthorization(ctx, db.ResolveUserAuthorizationParams{
		OrganizationID: organizationID, UserID: userID,
	})
	if err != nil {
		return schema.UserAuthorization{}, err
	}
	assignment := schema.UserAuthorization{Enabled: row.Enabled, Roles: row.Roles, Permissions: row.Permissions}
	if err := s.validateAssignment(ctx, organizationID, assignment); err != nil {
		return schema.UserAuthorization{}, err
	}
	return assignment, nil
}

// ReplaceAuthorization replaces all assignment state; Enabled must be explicit.
// The actor's stored grants are rechecked inside the lock, so revocation cannot
// race another management request. Never call the raw SQL
// replacement from a driver: it deliberately lacks this transactional policy.
func (s *Store) ReplaceAuthorization(ctx context.Context, organizationID, actorID, userID uuid.UUID, assignment schema.UserAuthorization) (schema.UserAuthorization, error) {
	var result schema.UserAuthorization
	err := s.uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(s.uof.DBTX(ctx))
		grants, err := s.lockManager(ctx, q, organizationID, actorID)
		if err != nil {
			return err
		}
		if err := s.validateAssignment(ctx, organizationID, assignment); err != nil {
			return err
		}
		// Get, not Resolve: managers must be able to re-enable a member.
		current, err := q.GetOrganizationUser(ctx, db.GetOrganizationUserParams{OrganizationID: organizationID, UserID: userID})
		if err != nil {
			return err
		}
		roles, err := s.Roles(ctx, organizationID)
		if err != nil {
			return err
		}
		if err := requireAssignmentAuthority(grants, schema.UserAuthorization{Enabled: current.Enabled, Roles: current.Roles, Permissions: current.Permissions}, roles); err != nil {
			return err
		}
		if err := requireAssignmentAuthority(grants, assignment, roles); err != nil {
			return err
		}
		if current.Enabled && slices.Contains(current.Roles, schema.RoleAdministrator) && !assignment.IsAdministrator() {
			count, err := q.CountOrganizationAdministrators(ctx, organizationID)
			if err != nil {
				return err
			}
			if count <= 1 {
				return ErrLastAdministrator
			}
		}
		row, err := q.ReplaceUserAuthorization(ctx, db.ReplaceUserAuthorizationParams{
			OrganizationID: organizationID, UserID: userID, Enabled: assignment.Enabled,
			Roles: append([]string{}, assignment.Roles...), Permissions: append([]string{}, assignment.Permissions...),
		})
		result = schema.UserAuthorization{Enabled: row.Enabled, Roles: row.Roles, Permissions: row.Permissions}
		return err
	})
	return result, err
}

// UpdateProfile edits a global human identity through live membership in this org.
// Name/email are shared across all memberships; subject is never editable. A
// successful edit takes profile ownership from IdP claims on future sign-ins.
// Callers must make the global nature of this operation explicit in their UI/API.
func (s *Store) UpdateProfile(ctx context.Context, organizationID, actorID, userID uuid.UUID, name, email string) (db.UpdateOrganizationUserProfileRow, error) {
	var result db.UpdateOrganizationUserProfileRow
	err := s.uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(s.uof.DBTX(ctx))
		grants, err := s.lockManager(ctx, q, organizationID, actorID)
		if err != nil {
			return err
		}
		current, err := q.GetOrganizationUser(ctx, db.GetOrganizationUserParams{OrganizationID: organizationID, UserID: userID})
		if err != nil {
			return err
		}
		roles, err := s.Roles(ctx, organizationID)
		if err != nil {
			return err
		}
		if err := requireAssignmentAuthority(grants, schema.UserAuthorization{Enabled: current.Enabled, Roles: current.Roles, Permissions: current.Permissions}, roles); err != nil {
			return err
		}
		result, err = q.UpdateOrganizationUserProfile(ctx, db.UpdateOrganizationUserProfileParams{
			OrganizationID: organizationID, UserID: userID, Name: name, Email: email,
		})
		return err
	})
	return result, err
}

// RequirePermission never trusts an adapter's static scopes, JWT or warm grants.
// ResolveGrants also enforces live human membership and valid stored definitions.
func (s *Store) RequirePermission(ctx context.Context, organizationID, actorID uuid.UUID, required string) ([]string, error) {
	grants, err := s.ResolveGrants(ctx, organizationID, actorID)
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, ErrInvalidAuthorization) {
		return nil, ErrMissingPermission
	}
	if err != nil {
		return nil, err
	}
	if !scope.HasScope(grants, required) {
		return nil, ErrMissingPermission
	}
	return grants, nil
}

func (s *Store) lockManager(ctx context.Context, q *db.Queries, organizationID, actorID uuid.UUID) ([]string, error) {
	if _, err := q.LockUserAuthorizationOrganization(ctx, organizationID); err != nil {
		return nil, err
	}
	// Separate statement after waiting: READ COMMITTED sees any revoked grants.
	return s.RequirePermission(ctx, organizationID, actorID, scope.Write(scope.Users))
}

func requireAuthority(grants, permissions []string) error {
	if !scope.HasAllScopes(grants, permissions) {
		return ErrCannotDelegate
	}
	return nil
}

func requireAssignmentAuthority(grants []string, assignment schema.UserAuthorization, roles []schema.Role) error {
	if err := validateAssignment(assignment, roles); err != nil {
		return err
	}
	// Disabled assignments retain authority. Check it even while disabled, so
	// removing high privileges or restoring access cannot bypass attenuation.
	assignment.Enabled = true
	return requireAuthority(grants, assignment.EffectiveScopes(roles...))
}
