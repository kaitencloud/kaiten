package listinstanceinvoices

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoicelist"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "ListInstanceInvoices"

type UseCase struct {
	deps access.Deps
}

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists one instance's invoices, across every life of its
// subscription.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string, params invoicelist.Params) (pagination.Page[invoices.InvoiceSummary], error) {
	empty := pagination.Page[invoices.InvoiceSummary]{Items: []invoices.InvoiceSummary{}, NextCursor: nil, HasMore: false}
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return empty, err
	}
	q := u.deps.Queries(ctx)
	instance, err := q.GetInstanceBySlug(ctx, db.GetInstanceBySlugParams{OrganizationID: user.OrganizationID, Slug: instanceSlug})
	if errors.Is(err, pgx.ErrNoRows) {
		return empty, kaitenerrors.NotFoundf(operation+".InstanceNotFound", "instance %q not found", instanceSlug)
	}
	if err != nil {
		return empty, err
	}
	sub, err := q.GetInstanceBilling(ctx, db.GetInstanceBillingParams{OrganizationID: user.OrganizationID, InstanceID: &instance.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		return empty, nil
	}
	if err != nil {
		return empty, err
	}
	clock, err := q.BillingClock(ctx)
	if err != nil {
		return empty, err
	}
	return invoicelist.List(ctx, q, operation, user.OrganizationID, &sub.ID, params, "", clock.Time.UTC())
}
