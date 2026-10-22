package management

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/storage"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

func roleError(err error) error {
	switch {
	case errors.Is(err, storage.ErrBuiltInRole):
		return apierrors.Conflict("Users.BuiltInRole", "Built-in roles are immutable")
	case errors.Is(err, storage.ErrRoleInUse):
		return apierrors.Conflict("Users.RoleInUse", "Role is assigned to users")
	case errors.Is(err, storage.ErrInvalidAuthorization):
		return apierrors.Validation("Users.InvalidRole", err.Error())
	case errors.Is(err, pgx.ErrNoRows):
		return apierrors.NotFound("Users.RoleNotFound", "Role not found in this organization")
	case apierrors.IsUniqueViolationOnConstraint(err, "user_organization_role_pkey"):
		return apierrors.Conflict("Users.RoleAlreadyExists", "Role slug already exists")
	default:
		return managementError(err)
	}
}

func (u *UseCase) ListRoles(ctx context.Context, orgID, actorID uuid.UUID) ([]schema.Role, error) {
	if err := u.requirePermission(ctx, orgID, actorID, scope.Read(scope.Users)); err != nil {
		return nil, err
	}
	return u.store.Roles(ctx, orgID)
}

func (u *UseCase) CreateRole(ctx context.Context, orgID, actorID uuid.UUID, input schema.CreateRole) (schema.Role, error) {
	result, err := u.store.CreateRole(ctx, orgID, actorID, input)
	return result, roleError(err)
}

func (u *UseCase) UpdateRole(ctx context.Context, orgID, actorID uuid.UUID, slug string, input schema.RoleDefinition) (schema.Role, error) {
	result, err := u.store.UpdateRole(ctx, orgID, actorID, slug, input)
	return result, roleError(err)
}

func (u *UseCase) DeleteRole(ctx context.Context, orgID, actorID uuid.UUID, slug string) error {
	return roleError(u.store.DeleteRole(ctx, orgID, actorID, slug))
}

func (u *UseCase) SetEnabled(ctx context.Context, orgID, actorID, userID uuid.UUID, enabled bool) (schema.UserAuthorization, error) {
	result, err := u.store.SetEnabled(ctx, orgID, actorID, userID, enabled)
	return result, managementError(err)
}

func (u *UseCase) SetAssignments(ctx context.Context, orgID, actorID, userID uuid.UUID, input schema.UserRoleAssignments) (schema.UserAuthorization, error) {
	result, err := u.store.SetAssignments(ctx, orgID, actorID, userID, input)
	return result, managementError(err)
}
