import type { WebhookEventEntries } from './webhook-event-catalogue';

// The billing events of the webhook catalogue (webhook-event-catalogue.ts),
// listed apart so that neither file outgrows the size limit: subscriptions,
// invoices, add-ons and vouchers. The catalogue's checks hold here too: each
// entry's type is checked against the contract, a name that leaves it fails
// typecheck, and the catalogue fails while an event is in neither file.
export const BILLING_WEBHOOK_EVENTS = {
  INSTANCE_BILLING_CANCELED: {
    type: 'com.kaiten.instance.billing.v1.canceled',
    group: 'subscription',
  },
  INSTANCE_BILLING_CANCELLATION_REVERTED: {
    type: 'com.kaiten.instance.billing.v1.cancellation_reverted',
    group: 'subscription',
  },
  INSTANCE_BILLING_CANCELLATION_SCHEDULED: {
    type: 'com.kaiten.instance.billing.v1.cancellation_scheduled',
    group: 'subscription',
  },
  INSTANCE_BILLING_PLAN_CHANGED: {
    type: 'com.kaiten.instance.billing.v1.plan_changed',
    group: 'subscription',
  },
  INSTANCE_BILLING_PLAN_CHANGE_CANCELLED: {
    type: 'com.kaiten.instance.billing.v1.plan_change_cancelled',
    group: 'subscription',
  },
  INSTANCE_BILLING_PLAN_CHANGE_SCHEDULED: {
    type: 'com.kaiten.instance.billing.v1.plan_change_scheduled',
    group: 'subscription',
  },
  INSTANCE_BILLING_STARTED: {
    type: 'com.kaiten.instance.billing.v1.started',
    group: 'subscription',
  },
  INSTANCE_BILLING_STATUS_CHANGED: {
    type: 'com.kaiten.instance.billing.v1.status_changed',
    group: 'subscription',
  },
  INSTANCE_INVOICE_HANDOFF_ACKNOWLEDGED: {
    type: 'com.kaiten.instance.invoice.v1.handoff_acknowledged',
    group: 'invoice',
  },
  INSTANCE_INVOICE_HELD: {
    type: 'com.kaiten.instance.invoice.v1.held',
    group: 'invoice',
  },
  INSTANCE_INVOICE_ISSUED: {
    type: 'com.kaiten.instance.invoice.v1.issued',
    group: 'invoice',
  },
  INSTANCE_INVOICE_MARKED_UNCOLLECTIBLE: {
    type: 'com.kaiten.instance.invoice.v1.marked_uncollectible',
    group: 'invoice',
  },
  INSTANCE_INVOICE_PAID: {
    type: 'com.kaiten.instance.invoice.v1.paid',
    group: 'invoice',
  },
  INSTANCE_INVOICE_RELEASED: {
    type: 'com.kaiten.instance.invoice.v1.released',
    group: 'invoice',
  },
  INSTANCE_INVOICE_VOIDED: {
    type: 'com.kaiten.instance.invoice.v1.voided',
    group: 'invoice',
  },
} as const satisfies Partial<WebhookEventEntries>;
