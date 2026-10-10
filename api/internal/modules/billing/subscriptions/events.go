package subscriptions

import (
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/shared/nullable"
)

// StatusChange is the payload of INSTANCE_BILLING_STATUS_CHANGED.
type StatusChange struct {
	InstanceBillingID uuid.UUID `json:"instanceBillingId"`
	InstanceSlug      string    `json:"instanceSlug"`
	From              string    `json:"from" enum:"TRIAL,ACTIVE,PAST_DUE,CANCELED"`
	To                string    `json:"to" enum:"TRIAL,ACTIVE,PAST_DUE,CANCELED"`
	Reason            string    `json:"reason" enum:"TRIAL_ENDED,INVOICE_OVERDUE,PAYMENT_FAILED,SETTLED"`
}

// CancellationChange is the payload of a cancellation scheduled or reverted.
type CancellationChange struct {
	InstanceBilling
	EffectiveAt time.Time `json:"effectiveAt" doc:"The boundary the cancellation takes effect at"`
}

// Cancellation is the payload of INSTANCE_BILLING_CANCELED.
type Cancellation struct {
	InstanceBilling
	Mode           string     `json:"mode" enum:"AT_PERIOD_END,IMMEDIATE" doc:"How it was canceled; a trial is canceled at once in either mode"`
	FinalInvoiceID *uuid.UUID `json:"finalInvoiceId" doc:"The FINAL invoice; null when the cancellation issued none (a trial)"`
}

// TransformSchema publishes Cancellation's absent members as null (§15.1:
// finalInvoiceId|null), its InstanceBilling ones included.
func (Cancellation) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, Cancellation{})
}

// PlanChangeSchedule is the payload of a plan change scheduled or cancelled.
type PlanChangeSchedule struct {
	InstanceSlug string    `json:"instanceSlug"`
	FromPriceID  uuid.UUID `json:"fromPriceId"`
	ToPriceID    uuid.UUID `json:"toPriceId"`
	EffectiveAt  time.Time `json:"effectiveAt"`
}

// PlanChange is the payload of INSTANCE_BILLING_PLAN_CHANGED.
type PlanChange struct {
	InstanceSlug    string    `json:"instanceSlug"`
	FromLicenseSlug string    `json:"fromLicenseSlug"`
	ToLicenseSlug   string    `json:"toLicenseSlug"`
	FromPriceID     uuid.UUID `json:"fromPriceId"`
	ToPriceID       uuid.UUID `json:"toPriceId"`
	InvoiceID       uuid.UUID `json:"invoiceId" doc:"The RENEWAL that billed the old plan's arrears and the new plan's advance"`
}

// RegisterWebhooks declares the subscription lifecycle events.
// ProviderChange is the payload of INSTANCE_BILLING_PROVIDER_CHANGED.
type ProviderChange struct {
	InstanceSlug  string `json:"instanceSlug"`
	From          string `json:"from" enum:"NOOP,STRIPE"`
	To            string `json:"to" enum:"NOOP,STRIPE"`
	EffectiveFrom string `json:"effectiveFrom" enum:"next_composition" doc:"Invoices already composed keep their provider"`
}

func RegisterWebhooks(api huma.API) {
	for _, d := range []webhook.Declaration{
		{
			Event: events.InstanceBillingProviderChanged, Data: (*ProviderChange)(nil), OperationID: "onInstanceBillingProviderChanged",
			Summary: "Instance Billing Provider Changed Webhook", Description: "Triggered when a subscription moves to another payment provider, from its next invoice on.",
		},
		{
			Event: events.InstanceBillingStatusChanged, Data: (*StatusChange)(nil), OperationID: "onInstanceBillingStatusChanged",
			Summary: "Instance Billing Status Changed Webhook", Description: "Triggered when a trial converts, or a subscription becomes PAST_DUE or leaves it.",
		},
		{
			Event: events.InstanceBillingCancellationScheduled, Data: (*CancellationChange)(nil), OperationID: "onInstanceBillingCancellationScheduled",
			Summary: "Instance Billing Cancellation Scheduled Webhook", Description: "Triggered when a subscription is set to cancel at the end of its period.",
		},
		{
			Event: events.InstanceBillingCancellationReverted, Data: (*CancellationChange)(nil), OperationID: "onInstanceBillingCancellationReverted",
			Summary: "Instance Billing Cancellation Reverted Webhook", Description: "Triggered when a scheduled cancellation is reverted before the boundary.",
		},
		{
			Event: events.InstanceBillingCanceled, Data: (*Cancellation)(nil), OperationID: "onInstanceBillingCanceled",
			Summary: "Instance Billing Canceled Webhook", Description: "Triggered when a subscription is canceled: at its period's end, immediately, or during its trial.",
		},
		{
			Event: events.InstanceBillingPlanChangeScheduled, Data: (*PlanChangeSchedule)(nil), OperationID: "onInstanceBillingPlanChangeScheduled",
			Summary: "Instance Billing Plan Change Scheduled Webhook", Description: "Triggered when a plan change is scheduled for the next boundary, or replaced.",
		},
		{
			Event: events.InstanceBillingPlanChangeCancelled, Data: (*PlanChangeSchedule)(nil), OperationID: "onInstanceBillingPlanChangeCancelled",
			Summary: "Instance Billing Plan Change Cancelled Webhook", Description: "Triggered when a scheduled plan change is dropped: by request, or by a cancellation.",
		},
		{
			Event: events.InstanceBillingPlanChanged, Data: (*PlanChange)(nil), OperationID: "onInstanceBillingPlanChanged",
			Summary: "Instance Billing Plan Changed Webhook", Description: "Triggered when a scheduled plan change is applied at a boundary.",
		},
	} {
		d.Tags = []string{"webhooks", "billing"}
		webhook.Declare(api, d)
	}
}
