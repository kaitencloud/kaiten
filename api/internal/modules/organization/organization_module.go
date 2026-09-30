package organization

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/addmembership"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/deletemembership"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/deleteorganization"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensureorganization"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/getorganization"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/listorganizations"
)

// UseCases contains all the use case handlers for the organization module.
type UseCases struct {
	GetOrganization    *getorganization.UseCase
	DeleteOrganization *deleteorganization.UseCase
	DeleteMembership   *deletemembership.UseCase

	// AddMembership is the organization module's public port for other
	// modules that need to create a membership row as part of their own
	// workflow (e.g. identity/createserviceaccount provisioning a service
	// account's org membership) instead of reaching into this module's
	// own generated db package directly.
	AddMembership *addmembership.UseCase

	// EnsureOrganization is published twice, and reaches the same use case both
	// times. On kaiten.InProcess for the two callers with no credential to authorize
	// with -- JIT provisioning, which runs while the token carrying the claims is
	// still being resolved, and kaiten-admin-tools, which runs before the API is
	// listening -- and on kaiten.Platform for a bootstrapper that does hold one. The
	// caller type is the whole difference, and with it whether a scope is checked.
	//
	// ListOrganizations appears on no surface. A cross-tenant organization list is the
	// enumeration the Platform API is designed to make impossible, so InProcess is the
	// only place it could be published; its package comment argues that case.
	//
	// ensuremembership, the third credential-free slice this module owns, is not here:
	// its only caller is users/ensureuser, which composes it the way
	// identity/createserviceaccount composes addmembership -- by constructing the use
	// case it names, not by reading a field off this struct.
	EnsureOrganization *ensureorganization.UseCase
	ListOrganizations  *listorganizations.UseCase

	// TargetOrganization is this module's public port for the Platform API's
	// {orgId} namespace, whose operations must verify a target tenant exists
	// before acting on it (kaiten.Platform.bindTarget). This module owns the
	// organization table, so the check belongs here; the port is one method rather
	// than *db.Queries so a consumer that needs "does this exist" cannot reach the
	// rest of the table.
	TargetOrganization TargetOrganizationResolver

	// SystemActor is this module's public port for work Kaiten does on its own
	// behalf inside one organization -- today, consuming a CDC delivery. The acting
	// user is system:kaiten, which is a row in "user" with a membership in every
	// organization, and both facts live in tables this module owns.
	//
	// Separate from TargetOrganization rather than folded into it, because the two
	// answer different questions for different callers: "does this tenant exist"
	// gates a Platform API operation ahead of its use case, "who acts here" produces
	// the principal an in-process consumer runs under. A consumer that needs the
	// second has no business being able to ask the first.
	SystemActor SystemActorResolver
}

// TargetOrganizationResolver is what this module offers the operations that act on
// a named tenant they do not belong to. The consumer declares the interface it
// needs and this module declares what it offers, so a one-method contract does not
// make either package depend on the other. The generated Queries satisfies it.
type TargetOrganizationResolver interface {
	OrganizationExists(ctx context.Context, organizationID uuid.UUID) (bool, error)
}

// ErrNoSystemActor is returned when the platform identity holds no live membership
// in the organization asked about.
//
// One error for two situations -- the organization is gone, or its membership was
// removed -- because the query cannot tell them apart and inventing a second error it
// could not populate would be a distinction the storage does not have. A consumer for
// which the difference matters asks OrganizationExists, which is a separate question
// with a separate answer; internal/kaiten's CDC entry point does exactly that, to
// drop the first case and retry the second.
//
// Declared here rather than passed through as pgx.ErrNoRows so that a consumer of
// this port does not have to import a database driver to read its result.
var ErrNoSystemActor = errors.New("organization: the platform identity holds no membership in this organization")

// SystemActorResolver resolves the user Kaiten acts as inside one organization.
//
// externalID is a parameter rather than a constant baked into the query so that
// platformidentity.ExternalID stays the single Go spelling of the identity -- the
// same reason the membership trigger resolves by external id: a deployment where the
// row exists under a different UUID must converge on the identity, not fork one.
//
// The signature names no generated type, which is why this port has an adapter and
// TargetOrganizationResolver does not: sqlc emits a Params struct for a two-argument
// query, and a port that offered one would put a row type in the signature of
// everything that consumes it -- including the facade, which exists to name neither a
// transport nor a storage.
type SystemActorResolver interface {
	SystemActorInOrganization(
		ctx context.Context, organizationID uuid.UUID, externalID string,
	) (uuid.UUID, error)
}

// systemActorResolver adapts the generated queries to SystemActorResolver.
type systemActorResolver struct {
	queries *db.Queries
}

func (r systemActorResolver) SystemActorInOrganization(
	ctx context.Context, organizationID uuid.UUID, externalID string,
) (uuid.UUID, error) {
	actorID, err := r.queries.ResolveSystemActorInOrganization(
		ctx, db.ResolveSystemActorInOrganizationParams{
			OrganizationID: organizationID,
			ExternalID:     externalID,
		})
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNoSystemActor
	}
	if err != nil {
		return uuid.Nil, err
	}

	return actorID, nil
}

// NewUseCases creates a new UseCases instance with all handlers initialized.
func NewUseCases(svc services.Container) *UseCases {
	queries := db.New(svc.Pool)
	return &UseCases{
		GetOrganization:    getorganization.NewUseCase(queries),
		DeleteOrganization: deleteorganization.NewUseCase(svc.Uof),
		DeleteMembership:   deletemembership.NewUseCase(queries),
		AddMembership:      addmembership.NewUseCase(svc.Uof),
		EnsureOrganization: ensureorganization.NewUseCase(queries),
		ListOrganizations:  listorganizations.NewUseCase(queries),
		TargetOrganization: queries,
		SystemActor:        systemActorResolver{queries: queries},
	}
}
