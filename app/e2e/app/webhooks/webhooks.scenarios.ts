import { WebhooksAppModel } from '../_support/model/webhooks-app-model';

// Event types are written as the API publishes them: the model checks them
// against saas-api's own pattern, not against the console's catalogue.

/** The Instance lifecycle preset, exactly: the seven types it checks. */
const INSTANCE_LIFECYCLE_TYPES = [
  'com.kaiten.instance.v1.created',
  'com.kaiten.instance.v1.updated',
  'com.kaiten.instance.v1.deleted',
  'com.kaiten.instance.v1.deployed',
  'com.kaiten.instance.v1.migrated',
  'com.kaiten.instance.v1.status_changed',
  'com.kaiten.instance.v1.lifecycle_stage_changed',
];

/**
 * Three webhooks of an organization that uses them: one on customer events, one
 * holding exactly the Instance lifecycle preset, one on invoices.
 */
export function createWebhooksFormModel() {
  return new WebhooksAppModel({
    webhooks: [
      {
        id: 'ep_customers',
        url: 'https://crm.example.com/hooks/kaiten',
        eventTypes: [
          'com.kaiten.customer.v1.created',
          'com.kaiten.customer.v1.updated',
        ],
      },
      {
        id: 'ep_lifecycle',
        url: 'https://ops.example.com/kaiten/instances',
        eventTypes: INSTANCE_LIFECYCLE_TYPES,
      },
      {
        id: 'ep_invoices',
        url: 'https://billing.example.com/kaiten',
        eventTypes: [
          'com.kaiten.instance.invoice.v1.paid',
          'com.kaiten.instance.invoice.v1.issued',
        ],
      },
    ],
  });
}

/**
 * A webhook subscribed, over the API, to an event the picker does not offer
 * (FEATURE_FLAG_EVALUATED) and to one newer than the console: the edit page
 * keeps both under "Other events".
 */
export function createWebhookWithOtherEventsModel() {
  return new WebhooksAppModel({
    webhooks: [
      {
        id: 'ep_other_events',
        url: 'https://hooks.example.com/other',
        eventTypes: [
          'com.kaiten.customer.v1.created',
          'com.kaiten.feature_flag.v1.evaluated',
          'com.kaiten.future_object.v1.created',
        ],
      },
    ],
  });
}

/** A webhook created outside the console without an event filter: it receives every event. */
export function createWebhookWithoutFilterModel() {
  return new WebhooksAppModel({
    webhooks: [
      {
        id: 'ep_no_filter',
        url: 'https://hooks.example.com/everything',
        eventTypes: null,
      },
    ],
  });
}
