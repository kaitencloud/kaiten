// Package storage owns validated, serialized users authorization writes. It
// authenticates no credentials and exposes no endpoint; drivers must supply a
// trusted actor and organization, and still enforce operation scopes.
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
)

var (
	ErrAdministratorRequired = errors.New("enabled organization administrator required")
	ErrLastAdministrator     = errors.New("cannot remove or disable the last organization administrator")
)

type Store struct{ uof *uow.UnitOfWork }

func New(uof *uow.UnitOfWork) *Store { return &Store{uof: uof} }

// Resolve returns pgx.ErrNoRows for a missing/disabled user, membership or org.
// Enabled members with no assignment have empty grants. Always resolve freshly.
func (s *Store) Resolve(ctx context.Context, organizationID, userID uuid.UUID) (schema.UserAuthorization, error) {
	row, err := db.New(s.uof.DBTX(ctx)).ResolveUserAuthorization(ctx, db.ResolveUserAuthorizationParams{
		OrganizationID: organizationID, UserID: userID,
	})
	return schema.UserAuthorization{Enabled: row.Enabled, Roles: row.Roles, Permissions: row.Permissions}, err
}

// ReplaceAuthorization replaces all assignment state; Enabled must be explicit.
// The acting administrator is rechecked inside the lock, so revoked administrators
// cannot race another administrator's management request. Never call the raw SQL
// replacement from a driver: it deliberately lacks this transactional policy.
func (s *Store) ReplaceAuthorization(ctx context.Context, organizationID, actorID, userID uuid.UUID, assignment schema.UserAuthorization) (schema.UserAuthorization, error) {
	var result schema.UserAuthorization
	err := s.uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(s.uof.DBTX(ctx))
		if err := s.lockAdministrator(ctx, q, organizationID, actorID); err != nil {
			return err
		}
		if err := assignment.Validate(); err != nil {
			return err
		}
		// Get, not Resolve: administrators must be able to re-enable a member.
		current, err := q.GetOrganizationUser(ctx, db.GetOrganizationUserParams{OrganizationID: organizationID, UserID: userID})
		if err != nil {
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
		if err := s.lockAdministrator(ctx, q, organizationID, actorID); err != nil {
			return err
		}
		var err error
		result, err = q.UpdateOrganizationUserProfile(ctx, db.UpdateOrganizationUserProfileParams{
			OrganizationID: organizationID, UserID: userID, Name: name, Email: email,
		})
		return err
	})
	return result, err
}

func (s *Store) lockAdministrator(ctx context.Context, q *db.Queries, organizationID, actorID uuid.UUID) error {
	if _, err := q.LockUserAuthorizationOrganization(ctx, organizationID); err != nil {
		return err
	}
	actor, err := s.Resolve(ctx, organizationID, actorID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrAdministratorRequired
	}
	if err != nil {
		return err
	}
	if !actor.IsAdministrator() || actor.Validate() != nil {
		return ErrAdministratorRequired
	}
	return nil
}
