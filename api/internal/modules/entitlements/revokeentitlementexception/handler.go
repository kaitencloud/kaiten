// Package revokeentitlementexception revokes an entitlement exception and
// keeps its row (§13.16): a scheduled one never starts, an active one ends
// at once.
package revokeentitlementexception

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/exceptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "RevokeEntitlementException"

type UseCase struct {
	deps   exceptions.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps exceptions.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute revokes the exception with its .revoked event. One already revoked
// or ended stays as it is, with no event: the route answers 204 either way.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string, id uuid.UUID) error {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}
	ctx = u.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	return u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		instance, err := exceptions.FindInstance(ctx, q, user.OrganizationID, instanceSlug, true, operation)
		if err != nil {
			return err
		}
		now, err := exceptions.Now(ctx, q)
		if err != nil {
			return err
		}
		// Classify the persisted target even for no-op revocation, before UPDATE.
		before, err := exceptions.List(ctx, q, user.OrganizationID, instance, &id, false, now)
		if err != nil {
			return err
		}
		if len(before) == 0 {
			return kaitenerrors.NotFoundf(operation+".NotFound", "exception %s not found on instance %q", id, instanceSlug)
		}
		if err := u.deps.AIPolicy.RequireType(ctx, before[0].EntitlementType); err != nil {
			return err
		}
		revoked, err := q.RevokeEntitlementException(ctx, db.RevokeEntitlementExceptionParams{
			Now: exceptions.Timestamp(now), UserID: &user.ID, OrganizationID: user.OrganizationID, InstanceID: instance.ID, ID: id,
		})
		if err != nil {
			return err
		}
		list, err := exceptions.List(ctx, q, user.OrganizationID, instance, &id, false, now)
		if err != nil {
			return err
		}
		if len(list) == 0 {
			return kaitenerrors.NotFoundf(operation+".NotFound", "exception %s not found on instance %q", id, instanceSlug)
		}
		if revoked == 0 {
			return nil
		}
		return exceptions.Emit(ctx, u.outbox, user.OrganizationID, instance.ID, events.InstanceEntitlementExceptionRevoked, list[0])
	})
}
