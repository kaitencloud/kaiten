package getinstancebilling

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	deps access.Deps
}

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads an instance's subscription: 404 when the instance is unknown
// or was never subscribed.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string) (*subscriptions.InstanceBilling, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	notFound := kaitenerrors.NotFoundf("GetInstanceBilling.NotFound", "instance %q has no subscription", instanceSlug)
	q := u.deps.Queries(ctx)
	instance, err := q.GetInstanceBySlug(ctx, db.GetInstanceBySlugParams{OrganizationID: user.OrganizationID, Slug: instanceSlug})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound
	}
	if err != nil {
		return nil, err
	}
	row, err := q.GetInstanceBilling(ctx, db.GetInstanceBillingParams{OrganizationID: user.OrganizationID, InstanceID: &instance.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound
	}
	if err != nil {
		return nil, err
	}
	return subscriptions.Build(ctx, q, u.deps.Catalogue, row)
}
