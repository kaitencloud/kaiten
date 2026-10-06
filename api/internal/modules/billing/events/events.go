package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	InstanceBillingStarted = events.New("INSTANCE_BILLING_STARTED", "com.kaiten.instance.billing.v1.started")

	InstanceInvoiceIssued = events.New("INSTANCE_INVOICE_ISSUED", "com.kaiten.instance.invoice.v1.issued")
	InstanceInvoicePaid   = events.New("INSTANCE_INVOICE_PAID", "com.kaiten.instance.invoice.v1.paid")
	InstanceInvoiceHeld   = events.New("INSTANCE_INVOICE_HELD", "com.kaiten.instance.invoice.v1.held")

	InstanceInvoiceReleased            = events.New("INSTANCE_INVOICE_RELEASED", "com.kaiten.instance.invoice.v1.released")
	InstanceInvoiceMarkedUncollectible = events.New("INSTANCE_INVOICE_MARKED_UNCOLLECTIBLE", "com.kaiten.instance.invoice.v1.marked_uncollectible")
	InstanceInvoiceVoided              = events.New("INSTANCE_INVOICE_VOIDED", "com.kaiten.instance.invoice.v1.voided")
	InstanceInvoiceHandoffAcknowledged = events.New("INSTANCE_INVOICE_HANDOFF_ACKNOWLEDGED", "com.kaiten.instance.invoice.v1.handoff_acknowledged")
)
