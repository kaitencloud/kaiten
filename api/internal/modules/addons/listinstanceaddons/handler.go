package listinstanceaddons

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists the add-ons an instance holds, or held.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string, includeRemoved bool) ([]catalogue.InstanceAddon, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	ctx = u.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	return u.ExecuteWithinOperation(ctx, instanceSlug, includeRemoved)
}

// ExecuteWithinOperation composes a parent operation using its already-resolved
// platform decision. It performs no provider evaluation while a transaction is held.
func (u *UseCase) ExecuteWithinOperation(ctx context.Context, instanceSlug string, includeRemoved bool) ([]catalogue.InstanceAddon, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}

	ctx = u.deps.AIPolicy.ForOrganization(ctx, user.OrganizationID)
	var out []catalogue.InstanceAddon
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		instanceID, err := q.GetInstanceIDBySlug(ctx, db.GetInstanceIDBySlugParams{OrganizationID: user.OrganizationID, Slug: instanceSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFoundf("ListInstanceAddons.InstanceNotFound", "instance %q not found", instanceSlug)
		}
		if err != nil {
			return err
		}
		sub, err := catalogue.LiveSubscription(ctx, q, user.OrganizationID, instanceID)
		if err != nil {
			return err
		}
		out, err = catalogue.InstanceAddonsOperational(ctx, q, user.OrganizationID, instanceID, sub, includeRemoved, nil, !u.deps.AIPolicy.Enabled(ctx))
		return err
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
