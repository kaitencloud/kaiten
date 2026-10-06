package listinvoices

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoicelist"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

type UseCase struct {
	deps access.Deps
}

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists the organization's invoices, every subscription's, newest
// first or by last change.
func (u *UseCase) Execute(ctx context.Context, params invoicelist.Params, instanceSlug string) (pagination.Page[invoices.InvoiceSummary], error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return pagination.Page[invoices.InvoiceSummary]{}, err
	}
	q := u.deps.Queries(ctx)
	clock, err := q.BillingClock(ctx)
	if err != nil {
		return pagination.Page[invoices.InvoiceSummary]{}, err
	}
	return invoicelist.List(ctx, q, "ListInvoices", user.OrganizationID, nil, params, instanceSlug, clock.Time.UTC())
}
