// Package getcustomerbilling reads a customer's side in each payment
// provider: its id there and its default payment method's labels.
package getcustomerbilling

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/paymentmethods"
)

const operation = "GetCustomerBilling"

// CustomerBilling is a customer's billing as the providers know it.
type CustomerBilling struct {
	BillingEmail *string                             `json:"billingEmail,omitempty" doc:"Where the customer's invoices are sent. Personal data"`
	Providers    []paymentmethods.CustomerInProvider `json:"providers" nullable:"false" doc:"The customer in each payment provider; none for NOOP"`
}

type UseCase struct{ deps access.Deps }

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads the customer's billing.
func (u *UseCase) Execute(ctx context.Context, customerSlug string) (*CustomerBilling, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	customer, err := paymentmethods.Customer(ctx, q, user.OrganizationID, customerSlug, operation)
	if err != nil {
		return nil, err
	}
	rows, err := q.ListCustomerBilling(ctx, db.ListCustomerBillingParams{OrganizationID: user.OrganizationID, CustomerID: customer.ID})
	if err != nil {
		return nil, err
	}
	out := &CustomerBilling{BillingEmail: customer.BillingEmail, Providers: []paymentmethods.CustomerInProvider{}}
	for _, row := range rows {
		out.Providers = append(out.Providers, paymentmethods.View(row))
	}
	return out, nil
}
