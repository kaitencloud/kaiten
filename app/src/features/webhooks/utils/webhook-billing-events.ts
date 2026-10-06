import type { WebhookEventEntries } from './webhook-event-catalogue';

// The billing events of the webhook catalogue (webhook-event-catalogue.ts),
// listed apart so that neither file outgrows the size limit: subscriptions,
// invoices, add-ons and vouchers. The catalogue's checks hold here too: each
// entry's type is checked against the contract, a name that leaves it fails
// typecheck, and the catalogue fails while an event is in neither file.
export const BILLING_WEBHOOK_EVENTS = {
  ADDON_ARCHIVED: {
    type: 'com.kaiten.addon.v1.archived',
    group: 'addon',
  },
  ADDON_CREATED: {
    type: 'com.kaiten.addon.v1.created',
    group: 'addon',
  },
  ADDON_DELETED: {
    type: 'com.kaiten.addon.v1.deleted',
    group: 'addon',
  },
  ADDON_ENTITLEMENT_ASSIGNED: {
    type: 'com.kaiten.addon.entitlement.v1.assigned',
    group: 'addon',
  },
  ADDON_ENTITLEMENT_UNASSIGNED: {
    type: 'com.kaiten.addon.entitlement.v1.unassigned',
    group: 'addon',
  },
  ADDON_ENTITLEMENT_UPDATED: {
    type: 'com.kaiten.addon.entitlement.v1.updated',
    group: 'addon',
  },
  ADDON_PRICE_CREATED: {
    type: 'com.kaiten.addon.price.v1.created',
    group: 'addon',
  },
  ADDON_PRICE_DEPRECATED: {
    type: 'com.kaiten.addon.price.v1.deprecated',
    group: 'addon',
  },
  ADDON_PUBLISHED: {
    type: 'com.kaiten.addon.v1.published',
    group: 'addon',
  },
  ADDON_UNARCHIVED: {
    type: 'com.kaiten.addon.v1.unarchived',
    group: 'addon',
  },
  ADDON_UPDATED: {
    type: 'com.kaiten.addon.v1.updated',
    group: 'addon',
  },
  INSTANCE_ADDON_ADDED: {
    type: 'com.kaiten.instance.addon.v1.added',
    group: 'subscription',
  },
  INSTANCE_ADDON_QUANTITY_CHANGED: {
    type: 'com.kaiten.instance.addon.v1.quantity_changed',
    group: 'subscription',
  },
  INSTANCE_ADDON_REMOVED: {
    type: 'com.kaiten.instance.addon.v1.removed',
    group: 'subscription',
  },
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
