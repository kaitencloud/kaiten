package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	InstanceBillingStarted               = events.New("INSTANCE_BILLING_STARTED", "com.kaiten.instance.billing.v1.started")
	InstanceBillingStatusChanged         = events.New("INSTANCE_BILLING_STATUS_CHANGED", "com.kaiten.instance.billing.v1.status_changed")
	InstanceBillingCancellationScheduled = events.New("INSTANCE_BILLING_CANCELLATION_SCHEDULED", "com.kaiten.instance.billing.v1.cancellation_scheduled")
	InstanceBillingCancellationReverted  = events.New("INSTANCE_BILLING_CANCELLATION_REVERTED", "com.kaiten.instance.billing.v1.cancellation_reverted")
	InstanceBillingCanceled              = events.New("INSTANCE_BILLING_CANCELED", "com.kaiten.instance.billing.v1.canceled")
	InstanceBillingPlanChangeScheduled   = events.New("INSTANCE_BILLING_PLAN_CHANGE_SCHEDULED", "com.kaiten.instance.billing.v1.plan_change_scheduled")
	InstanceBillingPlanChangeCancelled   = events.New("INSTANCE_BILLING_PLAN_CHANGE_CANCELLED", "com.kaiten.instance.billing.v1.plan_change_cancelled")
	InstanceBillingPlanChanged           = events.New("INSTANCE_BILLING_PLAN_CHANGED", "com.kaiten.instance.billing.v1.plan_changed")
	InstanceBillingProviderChanged       = events.New("INSTANCE_BILLING_PROVIDER_CHANGED", "com.kaiten.instance.billing.v1.provider_changed")

	InstanceInvoiceIssued = events.New("INSTANCE_INVOICE_ISSUED", "com.kaiten.instance.invoice.v1.issued")
	InstanceInvoicePaid   = events.New("INSTANCE_INVOICE_PAID", "com.kaiten.instance.invoice.v1.paid")
	InstanceInvoiceHeld   = events.New("INSTANCE_INVOICE_HELD", "com.kaiten.instance.invoice.v1.held")

	InstanceInvoiceReleased            = events.New("INSTANCE_INVOICE_RELEASED", "com.kaiten.instance.invoice.v1.released")
	InstanceInvoiceMarkedUncollectible = events.New("INSTANCE_INVOICE_MARKED_UNCOLLECTIBLE", "com.kaiten.instance.invoice.v1.marked_uncollectible")
	InstanceInvoiceVoided              = events.New("INSTANCE_INVOICE_VOIDED", "com.kaiten.instance.invoice.v1.voided")
	InstanceInvoiceHandoffAcknowledged = events.New("INSTANCE_INVOICE_HANDOFF_ACKNOWLEDGED", "com.kaiten.instance.invoice.v1.handoff_acknowledged")

	InstanceInvoicePushed        = events.New("INSTANCE_INVOICE_PUSHED", "com.kaiten.instance.invoice.v1.pushed")
	InstanceInvoicePushFailed    = events.New("INSTANCE_INVOICE_PUSH_FAILED", "com.kaiten.instance.invoice.v1.push_failed")
	InstanceInvoicePaymentFailed = events.New("INSTANCE_INVOICE_PAYMENT_FAILED", "com.kaiten.instance.invoice.v1.payment_failed")

	CustomerPaymentMethodAttached         = events.New("CUSTOMER_PAYMENT_METHOD_ATTACHED", "com.kaiten.customer.payment_method.v1.attached")
	CustomerPaymentMethodDetached         = events.New("CUSTOMER_PAYMENT_METHOD_DETACHED", "com.kaiten.customer.payment_method.v1.detached")
	CustomerPaymentMethodExpiring         = events.New("CUSTOMER_PAYMENT_METHOD_EXPIRING", "com.kaiten.customer.payment_method.v1.expiring")
	InstanceInvoiceReconciliationMismatch = events.New("INSTANCE_INVOICE_RECONCILIATION_MISMATCH", "com.kaiten.instance.invoice.v1.reconciliation_mismatch")

	BillingProviderSyncFailed   = events.New("BILLING_PROVIDER_SYNC_FAILED", "com.kaiten.billing_provider.v1.sync_failed")
	BillingProviderConnected    = events.New("BILLING_PROVIDER_CONNECTED", "com.kaiten.billing_provider.v1.connected")
	BillingProviderDisconnected = events.New("BILLING_PROVIDER_DISCONNECTED", "com.kaiten.billing_provider.v1.disconnected")
)
