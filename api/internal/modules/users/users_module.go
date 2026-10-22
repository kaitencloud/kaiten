// Package users owns JIT human identities and stored organization authorization.
package users

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensuremembership"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/listusermemberships"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/createrole"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/deleterole"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/deleteuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/ensureuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/getme"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/getuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/storage"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/listroles"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/listusers"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/management"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/putauthorization"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/resolveauthorization"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/resolveuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/setuserassignments"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/setuserenabled"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/suggestusers"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/updaterole"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/updateuser"
)

// UseCases contains all the use case handlers for the users module.
type UseCases struct {
	SetUserAssignments   *setuserassignments.UseCase
	ListRoles            *listroles.UseCase
	CreateRole           *createrole.UseCase
	UpdateRole           *updaterole.UseCase
	DeleteRole           *deleterole.UseCase
	SetUserEnabled       *setuserenabled.UseCase
	GetMe                *getme.UseCase
	PutAuthorization     *putauthorization.UseCase
	UpdateUser           *updateuser.UseCase
	GetUser              *getuser.UseCase
	ListUsers            *listusers.UseCase
	DeleteUser           *deleteuser.UseCase
	ResolveAuthorization *resolveauthorization.UseCase

	// EnsureUser, ResolveUser and SuggestUsers are published through kaiten.InProcess
	// only. See the package comment for why none of them has an endpoint, and each
	// package's own for why none of them could.
	EnsureUser   *ensureuser.UseCase
	ResolveUser  *resolveuser.UseCase
	SuggestUsers *suggestusers.UseCase
}

// NewUseCases creates a new UseCases instance with all handlers initialized.
func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Pool)
	manager := management.NewUseCase(svc.Uof)

	return &UseCases{
		SetUserAssignments:   setuserassignments.NewUseCase(manager),
		ListRoles:            listroles.NewUseCase(manager),
		CreateRole:           createrole.NewUseCase(manager),
		UpdateRole:           updaterole.NewUseCase(manager),
		DeleteRole:           deleterole.NewUseCase(manager),
		SetUserEnabled:       setuserenabled.NewUseCase(manager),
		GetMe:                getme.NewUseCase(manager),
		PutAuthorization:     putauthorization.NewUseCase(manager),
		UpdateUser:           updateuser.NewUseCase(manager),
		GetUser:              getuser.NewUseCase(manager),
		ListUsers:            listusers.NewUseCase(manager),
		ResolveAuthorization: resolveauthorization.NewUseCase(storage.New(svc.Uof)),
		DeleteUser: deleteuser.NewUseCase(deleteuser.Deps{
			Queries:       queries,
			Memberships:   listusermemberships.NewUseCase(svc.Pool),
			UsageReporter: svc.UsageReporter,
		}),
		EnsureUser: ensureuser.NewUseCase(ensureuser.Deps{
			Uof:           svc.Uof,
			UsageReporter: svc.UsageReporter,
			// The organization module's own use case, constructed here rather than read
			// off organization.UseCases — the same way identity/createserviceaccount
			// composes addmembership. It joins the transaction EnsureUser opens, so a
			// membership this refuses rolls back the user row written moments earlier.
			Membership: ensuremembership.NewUseCase(svc.Uof),
		}),
		ResolveUser:  resolveuser.NewUseCase(queries),
		SuggestUsers: suggestusers.NewUseCase(queries),
	}
}
