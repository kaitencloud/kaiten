package updatecustomer

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// SetBillingEmail stores where a customer's invoices go and changes nothing
// else: the update every other path makes, with the customer's own fields sent
// back as they are. A self-serve checkout uses it for the address its customer
// typed (§14.4 rule 6), so the address is validated and the change announced
// exactly as an edit in the console is.
func (h *UseCase) SetBillingEmail(ctx context.Context, slug, email string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}
	current, err := h.repo.q(ctx).GetOneCustomer(ctx, db.GetOneCustomerParams{Slug: slug, OrganizationID: user.OrganizationID})
	if errors.Is(err, pgx.ErrNoRows) {
		return kaitenerrors.NotFound("UpdateCustomer.NotFound", fmt.Sprintf("Customer with slug %q not found", slug))
	}
	if err != nil {
		return err
	}
	_, err = h.Execute(ctx, &Command{
		Name: current.Name, ExternalCustomerID: current.ExternalCustomerID, Domain: current.Domain, BillingEmail: &email,
	}, slug)
	return err
}
