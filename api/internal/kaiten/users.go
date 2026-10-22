package kaiten

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/users"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/createrole"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/deleterole"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/getme"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/getuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/listroles"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/listusers"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/putauthorization"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/setuserassignments"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/setuserenabled"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/updaterole"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/updateuser"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

type Users struct{ uc *users.UseCases }

func (k *Kaiten) Users() Users { return Users{uc: k.modules.Users} }
func (u Users) ListUsers(ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string) (pagination.Page[schema.ManagedUser], error) {
	if err := cl.Require(listusers.RequiredScope); err != nil {
		return pagination.Page[schema.ManagedUser]{}, err
	}
	return u.uc.ListUsers.Execute(bindOrganization(ctx, cl), cl.OrganizationID(), cl.UserID(), limit, cursor)
}

func (u Users) GetUser(ctx context.Context, cl caller.OrganizationCaller, id uuid.UUID) (schema.ManagedUser, error) {
	if err := cl.Require(getuser.RequiredScope); err != nil {
		return schema.ManagedUser{}, err
	}
	return u.uc.GetUser.Execute(bindOrganization(ctx, cl), cl.OrganizationID(), cl.UserID(), id)
}

func (u Users) UpdateUser(ctx context.Context, cl caller.OrganizationCaller, id uuid.UUID, profile schema.Profile) error {
	if err := cl.Require(updateuser.RequiredScope); err != nil {
		return err
	}
	return u.uc.UpdateUser.Execute(bindOrganization(ctx, cl), cl.OrganizationID(), cl.UserID(), id, profile)
}

func (u Users) PutUserAuthorization(ctx context.Context, cl caller.OrganizationCaller, id uuid.UUID, assignment schema.UserAuthorization) (schema.UserAuthorization, error) {
	if err := cl.Require(putauthorization.RequiredScope); err != nil {
		return schema.UserAuthorization{}, err
	}
	return u.uc.PutAuthorization.Execute(bindOrganization(ctx, cl), cl.OrganizationID(), cl.UserID(), id, assignment)
}

func (u Users) GetMe(ctx context.Context, cl caller.OrganizationCaller) (schema.Me, error) {
	if err := cl.Require(getme.RequiredScope); err != nil {
		return schema.Me{}, err
	}
	return u.uc.GetMe.Execute(bindOrganization(ctx, cl), cl.OrganizationID(), cl.UserID())
}

func (u Users) ListRoles(ctx context.Context, cl caller.OrganizationCaller) ([]schema.Role, error) {
	if err := cl.Require(listroles.RequiredScope); err != nil {
		return nil, err
	}
	return u.uc.ListRoles.Execute(bindOrganization(ctx, cl), cl.OrganizationID(), cl.UserID())
}

func (u Users) CreateRole(ctx context.Context, cl caller.OrganizationCaller, input schema.CreateRole) (schema.Role, error) {
	if err := cl.Require(createrole.RequiredScope); err != nil {
		return schema.Role{}, err
	}
	return u.uc.CreateRole.Execute(bindOrganization(ctx, cl), cl.OrganizationID(), cl.UserID(), input)
}

func (u Users) UpdateRole(ctx context.Context, cl caller.OrganizationCaller, slug string, input schema.RoleDefinition) (schema.Role, error) {
	if err := cl.Require(updaterole.RequiredScope); err != nil {
		return schema.Role{}, err
	}
	return u.uc.UpdateRole.Execute(bindOrganization(ctx, cl), cl.OrganizationID(), cl.UserID(), slug, input)
}

func (u Users) DeleteRole(ctx context.Context, cl caller.OrganizationCaller, slug string) error {
	if err := cl.Require(deleterole.RequiredScope); err != nil {
		return err
	}
	return u.uc.DeleteRole.Execute(bindOrganization(ctx, cl), cl.OrganizationID(), cl.UserID(), slug)
}

func (u Users) SetUserEnabled(ctx context.Context, cl caller.OrganizationCaller, id uuid.UUID, enabled bool) (schema.UserAuthorization, error) {
	if err := cl.Require(setuserenabled.RequiredScope); err != nil {
		return schema.UserAuthorization{}, err
	}
	return u.uc.SetUserEnabled.Execute(bindOrganization(ctx, cl), cl.OrganizationID(), cl.UserID(), id, enabled)
}

func (u Users) SetUserAssignments(ctx context.Context, cl caller.OrganizationCaller, id uuid.UUID, input schema.UserRoleAssignments) (schema.UserAuthorization, error) {
	if err := cl.Require(setuserassignments.RequiredScope); err != nil {
		return schema.UserAuthorization{}, err
	}
	return u.uc.SetUserAssignments.Execute(bindOrganization(ctx, cl), cl.OrganizationID(), cl.UserID(), id, input)
}
