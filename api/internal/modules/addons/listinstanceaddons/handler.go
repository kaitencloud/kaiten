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
		out, err = catalogue.InstanceAddons(ctx, q, user.OrganizationID, instanceID, sub, includeRemoved, nil)
		return err
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
