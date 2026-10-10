package getupcominginvoice

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "GetUpcomingInvoice"

type UseCase struct {
	deps   access.Deps
	closer *closing.Closer
}

func NewUseCase(deps access.Deps, closer *closing.Closer) *UseCase {
	return &UseCase{deps: deps, closer: closer}
}

// Execute previews the invoice an instance's next boundary will issue, on
// its usage so far.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string) (*rating.InvoicePreview, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	notFound := kaitenerrors.NotFoundf(operation+".NotFound", "instance %q has no subscription", instanceSlug)
	q := u.deps.Queries(ctx)
	instance, err := q.GetInstanceBySlug(ctx, db.GetInstanceBySlugParams{OrganizationID: user.OrganizationID, Slug: instanceSlug})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound
	}
	if err != nil {
		return nil, err
	}
	sub, err := q.GetInstanceBilling(ctx, db.GetInstanceBillingParams{OrganizationID: user.OrganizationID, InstanceID: &instance.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound
	}
	if err != nil {
		return nil, err
	}
	if !subscriptions.Live(sub.Status) {
		return nil, kaitenerrors.Conflict(operation+".NotActive", "the subscription is canceled: it has no upcoming invoice")
	}
	return u.closer.Preview(ctx, sub, operation)
}
