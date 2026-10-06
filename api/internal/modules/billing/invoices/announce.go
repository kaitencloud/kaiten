package invoices

import (
	"context"
	"encoding/json"

	"github.com/danielgtaylor/huma/v2"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
)

// maxIssuedLinesBytes keeps an issued event's lines within what a webhook can
// carry; beyond it the event says so and a consumer reads the invoice.
const maxIssuedLinesBytes = 200 * 1024

// AnnounceComposed records what a newly composed invoice is: issued for
// collection, or paid at once because nothing was owed. A held draft records
// nothing here: the period close announces its hold.
func AnnounceComposed(ctx context.Context, repo *outbox.ScopedRepository, row db.InstanceInvoice) error {
	invoice, err := FromRow(row)
	if err != nil {
		return err
	}
	switch row.Status {
	case db.InvoiceStatusMANUAL:
		return repo.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			row.OrganizationID, events.InstanceInvoiceIssued.Name, events.InstanceInvoiceIssued.Type, Issued(invoice), nil))
	case db.InvoiceStatusPAID:
		return repo.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			row.OrganizationID, events.InstanceInvoicePaid.Name, events.InstanceInvoicePaid.Type,
			PaidInvoice{InvoiceSummary: invoice.InvoiceSummary, Source: "ZERO_TOTAL", ExternalReference: nil}, nil))
	default:
		return nil
	}
}

// Issued is the issued event's payload: the invoice without its billing
// e-mail, its lines cut when they would not fit an event.
func Issued(invoice Invoice) IssuedInvoice {
	issued := IssuedInvoice{
		InvoiceSummary: invoice.InvoiceSummary, LicenseID: invoice.LicenseID, Lines: invoice.Lines, LinesTruncated: false,
	}
	for {
		encoded, err := json.Marshal(issued.Lines)
		if err != nil || len(encoded) <= maxIssuedLinesBytes || len(issued.Lines) == 0 {
			return issued
		}
		issued.Lines = issued.Lines[:len(issued.Lines)/2]
		issued.LinesTruncated = true
		if issued.Lines == nil {
			issued.Lines = []rating.InvoiceLine{}
		}
	}
}

// RegisterWebhooks declares the invoice events more than one operation
// records.
func RegisterWebhooks(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       events.InstanceInvoiceIssued,
		Data:        (*IssuedInvoice)(nil),
		OperationID: "onInstanceInvoiceIssued",
		Summary:     "Instance Invoice Issued Webhook",
		Description: "Triggered once per invoice with something owed, when it is issued. For an invoice the organization collects itself, it is the signal to claim it from the handoff queue, which stays the source of truth.",
		Tags:        []string{"webhooks", "billing"},
	})
	webhook.Declare(api, webhook.Declaration{
		Event:       events.InstanceInvoicePaid,
		Data:        (*PaidInvoice)(nil),
		OperationID: "onInstanceInvoicePaid",
		Summary:     "Instance Invoice Paid Webhook",
		Description: "Triggered when an invoice is paid: marked paid by the organization, or issued paid because nothing was owed.",
		Tags:        []string{"webhooks", "billing"},
	})
}
