// Package invoiceaction is what every action on an invoice does first: lock
// it the way every billing writer does, and refuse what only a payment
// provider may do.
package invoiceaction

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Lock locks an invoice's subscription, then the invoice: the order every
// billing writer takes them in, so an action cannot deadlock with a close.
// notFound is the code an unknown invoice answers.
func Lock(ctx context.Context, q *db.Queries, organizationID, invoiceID uuid.UUID, notFound string) (db.InstanceBilling, db.InstanceInvoice, error) {
	peek, err := q.GetInvoice(ctx, db.GetInvoiceParams{OrganizationID: organizationID, ID: invoiceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.InstanceBilling{}, db.InstanceInvoice{}, kaitenerrors.NotFoundf(notFound, "invoice %s not found", invoiceID)
	}
	if err != nil {
		return db.InstanceBilling{}, db.InstanceInvoice{}, err
	}
	sub, err := q.LockSubscriptionByID(ctx, db.LockSubscriptionByIDParams{OrganizationID: organizationID, ID: peek.InstanceBillingID})
	if err != nil {
		return db.InstanceBilling{}, db.InstanceInvoice{}, err
	}
	row, err := q.LockInvoice(ctx, db.LockInvoiceParams{OrganizationID: organizationID, ID: invoiceID})
	if err != nil {
		return db.InstanceBilling{}, db.InstanceInvoice{}, err
	}
	return sub, row, nil
}

// RefuseProviderManaged refuses to settle by hand an invoice a payment
// provider collects: its payment is recorded there, and mirrored here.
func RefuseProviderManaged(operation string, row db.InstanceInvoice) error {
	if row.ProviderKind != db.BillingProviderKindNOOP {
		return kaitenerrors.Conflict(operation+".ProviderManaged",
			"a payment provider collects this invoice: record the payment there")
	}
	return nil
}

// Reason checks a reason an action requires: 1 to 500 characters.
func Reason(operation, reason string) error {
	if n := len([]rune(reason)); n == 0 || n > 500 {
		return kaitenerrors.UnprocessableEntity(operation+".ReasonRequired", "a reason of 1 to 500 characters is required")
	}
	return nil
}
