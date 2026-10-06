package invoices

import (
	"context"
	"encoding/json"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenevents "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
)

type eventsMetadata = kaitenevents.Metadata

// maxIssuedLinesBytes keeps an issued event's lines within what a webhook can
// carry; beyond it the event says so and a consumer reads the invoice.
const maxIssuedLinesBytes = 200 * 1024

// AnnounceComposed records what a newly composed invoice is: held for its
// usage journal, issued for collection, or paid at once because nothing was
// owed.
func AnnounceComposed(ctx context.Context, repo *outbox.ScopedRepository, row db.InstanceInvoice) error {
	invoice, err := FromRow(row)
	if err != nil {
		return err
	}
	switch {
	case row.HoldReason != nil:
		var detail HoldDetail
		if invoice.HoldDetail != nil {
			detail = *invoice.HoldDetail
		}
		return repo.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			row.OrganizationID, events.InstanceInvoiceHeld.Name, events.InstanceInvoiceHeld.Type,
			HeldInvoice{InvoiceSummary: invoice.InvoiceSummary, HoldDetail: detail}, nil))
	case row.Status == db.InvoiceStatusMANUAL:
		return repo.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			row.OrganizationID, events.InstanceInvoiceIssued.Name, events.InstanceInvoiceIssued.Type, Issued(invoice), nil))
	case row.Status == db.InvoiceStatusPAID:
		return repo.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			row.OrganizationID, events.InstanceInvoicePaid.Name, events.InstanceInvoicePaid.Type,
			PaidInvoice{InvoiceSummary: invoice.InvoiceSummary, Source: "ZERO_TOTAL", ExternalReference: nil, Note: nil}, nil))
	default:
		return nil
	}
}

// Announce records one event about an invoice.
func Announce(ctx context.Context, repo *outbox.ScopedRepository, organizationID uuid.UUID, event eventsMetadata, payload any) error {
	return repo.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID, event.Name, event.Type, payload, nil))
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
		Event:       events.InstanceInvoiceHeld,
		Data:        (*HeldInvoice)(nil),
		OperationID: "onInstanceInvoiceHeld",
		Summary:     "Instance Invoice Held Webhook",
		Description: "Triggered when a period closes into an invoice held as a DRAFT, because the usage journal it was measured from failed a consistency check. It is neither issued nor handed off until released or recomposed.",
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
	webhook.Declare(api, webhook.Declaration{
		Event:       events.InstanceInvoiceReleased,
		Data:        (*ReleasedInvoice)(nil),
		OperationID: "onInstanceInvoiceReleased",
		Summary:     "Instance Invoice Released Webhook",
		Description: "Triggered when a held invoice leaves its hold: released by the organization, recomposed from a sound journal, or found sound by a later check. It is issued in the same transaction.",
		Tags:        []string{"webhooks", "billing"},
	})
	webhook.Declare(api, webhook.Declaration{
		Event:       events.InstanceInvoiceMarkedUncollectible,
		Data:        (*UncollectibleInvoice)(nil),
		OperationID: "onInstanceInvoiceMarkedUncollectible",
		Summary:     "Instance Invoice Marked Uncollectible Webhook",
		Description: "Triggered when an invoice is written off.",
		Tags:        []string{"webhooks", "billing"},
	})
	webhook.Declare(api, webhook.Declaration{
		Event:       events.InstanceInvoiceVoided,
		Data:        (*VoidedInvoice)(nil),
		OperationID: "onInstanceInvoiceVoided",
		Summary:     "Instance Invoice Voided Webhook",
		Description: "Triggered when an invoice is voided. Its boundary can then be recomposed into a replacement.",
		Tags:        []string{"webhooks", "billing"},
	})
	webhook.Declare(api, webhook.Declaration{
		Event:       events.InstanceInvoiceHandoffAcknowledged,
		Data:        (*HandoffAcknowledgement)(nil),
		OperationID: "onInstanceInvoiceHandoffAcknowledged",
		Summary:     "Instance Invoice Handoff Acknowledged Webhook",
		Description: "Triggered when the organization's accounting system acknowledges an invoice from the handoff queue, or the invoice is marked paid while still waiting there.",
		Tags:        []string{"webhooks", "billing"},
	})
}
