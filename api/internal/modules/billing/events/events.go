package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	InstanceBillingStarted = events.New("INSTANCE_BILLING_STARTED", "com.kaiten.instance.billing.v1.started")

	InstanceInvoiceIssued = events.New("INSTANCE_INVOICE_ISSUED", "com.kaiten.instance.invoice.v1.issued")
	InstanceInvoicePaid   = events.New("INSTANCE_INVOICE_PAID", "com.kaiten.instance.invoice.v1.paid")
	InstanceInvoiceHeld   = events.New("INSTANCE_INVOICE_HELD", "com.kaiten.instance.invoice.v1.held")
)
