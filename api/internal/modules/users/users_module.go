// Package users is kaiten's public API surface for the user resource.
// Deliberately minimal today: on the wire it carries only DeleteUser, the
// privileged, cross-organization delete:users operation — there is no
// self-service create/update/get here (users are JIT-provisioned from
// JWT claims, not managed through this API).
//
// The provisioning itself now lives here too, as EnsureUser, which is reachable
// only through kaiten.InProcess. That does not contradict the sentence above: a
// user still cannot be created through this API, because EnsureUser has no
// endpoint and could not have one — its caller is the authentication path, which
// runs strictly before any credential this deployment issued exists. What changed
// is that "JIT-provisioned from JWT claims" is now a use case in the module that
// owns the table, rather than SQL inlined in the middleware that resolves a token.
//
// ResolveUser and SuggestUsers arrive the same way and for a related reason. Nothing
// on either document looks a user up by the external id an identity provider issued
// — the wire's answer is pkg/externalid.DeriveUserID, computed by the client — so an
// operator naming a row this deployment created but did not derive needs a lookup
// that has no counterpart to be consistent with. Each package argues its own case.
package users

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensuremembership"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/deleteuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/ensureuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/resolveuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/suggestusers"
)

// UseCases contains all the use case handlers for the users module.
type UseCases struct {
	DeleteUser *deleteuser.UseCase

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

	return &UseCases{
		DeleteUser: deleteuser.NewUseCase(queries),
		EnsureUser: ensureuser.NewUseCase(ensureuser.Deps{
			Uof: svc.Uof,
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
