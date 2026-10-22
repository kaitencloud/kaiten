// Package management implements scope-authorized human user management.
package management

import (
	"context"
	"errors"
	"net/mail"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/storage"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

type UseCase struct {
	queries *db.Queries
	store   *storage.Store
}

func NewUseCase(uof *uow.UnitOfWork) *UseCase {
	return &UseCase{queries: db.New(uof.Ambient()), store: storage.New(uof)}
}

func (u *UseCase) requirePermission(ctx context.Context, orgID, actorID uuid.UUID, permission string) error {
	_, err := u.store.RequirePermission(ctx, orgID, actorID, permission)
	return managementError(err)
}

func managementError(err error) error {
	switch {
	case errors.Is(err, storage.ErrMissingPermission):
		return apierrors.Forbidden("Users.MissingPermission", "Missing required stored user-management permission")
	case errors.Is(err, storage.ErrCannotDelegate):
		return apierrors.Forbidden("Users.CannotDelegate", "Cannot manage or delegate permissions not held")
	case errors.Is(err, storage.ErrInvalidAuthorization):
		return apierrors.Validation("Users.InvalidAuthorization", err.Error())
	case errors.Is(err, storage.ErrLastAdministrator):
		return apierrors.Conflict("Users.LastAdministrator", "The last administrator cannot be demoted or disabled")
	case errors.Is(err, pgx.ErrNoRows):
		return apierrors.NotFound("Users.NotFound", "User not found in this organization")
	case apierrors.IsUniqueViolationOnConstraint(err, "user_email_key"):
		return apierrors.Conflict("Users.EmailAlreadyUsed", "Email is already assigned to another user")
	default:
		return err
	}
}

func user(row db.GetOrganizationUserRow) schema.ManagedUser {
	return schema.ManagedUser{ID: row.ID, ExternalID: row.ExternalID, Name: row.Name, Email: row.Email, CreatedAt: row.CreatedAt.Time, Authorization: schema.UserAuthorization{Enabled: row.Enabled, Roles: append([]string{}, row.Roles...), Permissions: append([]string{}, row.Permissions...)}}
}

func (u *UseCase) Get(ctx context.Context, orgID, actorID, userID uuid.UUID) (schema.ManagedUser, error) {
	if err := u.requirePermission(ctx, orgID, actorID, scope.Read(scope.Users)); err != nil {
		return schema.ManagedUser{}, err
	}
	row, err := u.queries.GetOrganizationUser(ctx, db.GetOrganizationUserParams{OrganizationID: orgID, UserID: userID})
	return user(row), managementError(err)
}

func (u *UseCase) Me(ctx context.Context, orgID, actorID uuid.UUID) (schema.Me, error) {
	a, err := u.store.Resolve(ctx, orgID, actorID)
	if err != nil {
		return schema.Me{}, managementError(err)
	}
	row, err := u.queries.GetOrganizationUser(ctx, db.GetOrganizationUserParams{OrganizationID: orgID, UserID: actorID})
	if err != nil {
		return schema.Me{}, managementError(err)
	}
	roles, err := u.store.Roles(ctx, orgID)
	if err != nil {
		return schema.Me{}, err
	}
	return schema.Me{User: user(row), OrganizationID: orgID, Scopes: a.EffectiveScopes(roles...), AvailableRoles: roles, AvailablePermissions: scope.OrganizationScopes()}, nil
}

func (u *UseCase) List(ctx context.Context, orgID, actorID uuid.UUID, limit int32, cursor *string) (pagination.Page[schema.ManagedUser], error) {
	if err := u.requirePermission(ctx, orgID, actorID, scope.Read(scope.Users)); err != nil {
		return pagination.Page[schema.ManagedUser]{}, err
	}
	var cursorID *uuid.UUID
	if cursor != nil {
		key, err := pagination.Decode[pagination.IDCursor](*cursor)
		if err != nil || key.ID == uuid.Nil {
			return pagination.Page[schema.ManagedUser]{}, apierrors.Validation("Users.InvalidCursor", "Invalid users cursor")
		}
		cursorID = &key.ID
	}
	limit = pagination.ClampLimit(limit)
	rows, err := u.queries.ListOrganizationUsers(ctx, db.ListOrganizationUsersParams{OrganizationID: orgID, CursorID: cursorID, LimitPlusOne: limit + 1})
	if err != nil {
		return pagination.Page[schema.ManagedUser]{}, err
	}
	items := make([]schema.ManagedUser, 0, len(rows))
	for _, row := range rows {
		items = append(items, user(db.GetOrganizationUserRow(row)))
	}
	return pagination.BuildPage(items, limit, func(item schema.ManagedUser) pagination.IDCursor { return pagination.IDCursor{ID: item.ID} })
}

func (u *UseCase) Replace(ctx context.Context, orgID, actorID, userID uuid.UUID, assignment schema.UserAuthorization) (schema.UserAuthorization, error) {
	if err := u.requirePermission(ctx, orgID, actorID, scope.Write(scope.Users)); err != nil {
		return schema.UserAuthorization{}, err
	}
	if err := assignment.Validate(); err != nil {
		return schema.UserAuthorization{}, apierrors.Validation("Users.InvalidAuthorization", err.Error())
	}
	result, err := u.store.ReplaceAuthorization(ctx, orgID, actorID, userID, assignment)
	return result, managementError(err)
}

func (u *UseCase) Update(ctx context.Context, orgID, actorID, userID uuid.UUID, profile schema.Profile) error {
	if err := u.requirePermission(ctx, orgID, actorID, scope.Write(scope.Users)); err != nil {
		return err
	}
	profile.Name, profile.Email = strings.TrimSpace(profile.Name), strings.TrimSpace(profile.Email)
	address, err := mail.ParseAddress(profile.Email)
	if profile.Name == "" || len(profile.Name) > 200 || err != nil || address.Address != profile.Email || len(profile.Email) > 320 {
		return apierrors.Validation("Users.InvalidProfile", "A display name and valid email address are required")
	}
	_, err = u.store.UpdateProfile(ctx, orgID, actorID, userID, profile.Name, profile.Email)
	return managementError(err)
}
