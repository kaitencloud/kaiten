// Package settings is an organization's billing defaults: the terms a
// subscription gets when it names none of its own.
package settings

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
)

// Collection methods, as the API spells them.
const (
	SendInvoice         = "SEND_INVOICE"
	ChargeAutomatically = "CHARGE_AUTOMATICALLY"
)

// Defaults an organization has before it writes any settings.
const (
	DefaultCollectionMethod = SendInvoice
	DefaultDaysUntilDue     = 30
)

// BillingSettings is an organization's billing defaults as the API shows them.
type BillingSettings struct {
	DefaultCollectionMethod string `json:"defaultCollectionMethod" enum:"SEND_INVOICE,CHARGE_AUTOMATICALLY" doc:"How an invoice is collected when its subscription does not say: SEND_INVOICE sends it for payment. CHARGE_AUTOMATICALLY needs a payment provider and is refused until one is available." example:"SEND_INVOICE"`
	DefaultDaysUntilDue     int32  `json:"defaultDaysUntilDue" doc:"Days an invoice is due after it is issued, when its subscription does not say; 0 to 365." example:"30"`
	HandoffStripeInvoices   bool   `json:"handoffStripeInvoices" doc:"Whether invoices a payment provider issues also enter the handoff queue, for an accounting system that wants every invoice. Invoices without a provider always do."`
}

// Read returns the organization's settings, or the defaults when it has
// written none.
func Read(ctx context.Context, queries *db.Queries, organizationID uuid.UUID) (BillingSettings, error) {
	row, err := queries.GetBillingSettings(ctx, organizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return BillingSettings{
			DefaultCollectionMethod: DefaultCollectionMethod,
			DefaultDaysUntilDue:     DefaultDaysUntilDue,
			HandoffStripeInvoices:   false,
		}, nil
	}
	if err != nil {
		return BillingSettings{}, err
	}
	return BillingSettings{
		DefaultCollectionMethod: string(row.DefaultCollectionMethod),
		DefaultDaysUntilDue:     row.DefaultDaysUntilDue,
		HandoffStripeInvoices:   row.HandoffStripeInvoices,
	}, nil
}
