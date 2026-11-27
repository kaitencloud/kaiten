import {
  type MockedMessage,
  WebhooksAppModel,
} from '../_support/model/webhooks-app-model';

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

// The deliveries scenarios: a fixed clock, the time the specs freeze the
// browser at, and messages counted back from it.

/** The time the deliveries specs freeze the browser clock at. */
export const WEBHOOKS_DELIVERIES_NOW = '2026-11-26T12:00:00Z';

const NOW_MS = Date.parse(WEBHOOKS_DELIVERIES_NOW);
const MINUTE_MS = 60_000;
const at = (minutesBeforeNow: number, seconds = 0) =>
  new Date(NOW_MS - minutesBeforeNow * MINUTE_MS + seconds * 1_000)
    .toISOString()
    .replace('.000Z', 'Z');

export const OPS_WEBHOOK_URL = 'https://ops.example.com/kaiten/alerts';
export const CRM_WEBHOOK_URL = 'https://crm.example.com/hooks/kaiten';
export const AUDIT_WEBHOOK_URL = 'https://audit.example.com/kaiten';

const INSTANCE_CREATED = 'com.kaiten.instance.v1.created';
const RELEASE_CREATED = 'com.kaiten.release.v1.created';
const CUSTOMER_UPDATED = 'com.kaiten.customer.v1.updated';
const EVENT_CYCLE = [INSTANCE_CREATED, RELEASE_CREATED, CUSTOMER_UPDATED];

/** The ids of the Ops alerts messages a spec reads by name. */
export const OPS_MESSAGES = {
  /** The newest, delivered at once, with a long payload. */
  newest: 'msg_ops_00',
  /** Being sent. */
  sending: 'msg_ops_01',
  /** Failed three times, the last time with no answer. */
  failed: 'msg_ops_02',
  /** Failed once, a retry scheduled. */
  retrying: 'msg_ops_03',
  /** Failed twice, then delivered by a manual resend. */
  resent: 'msg_ops_04',
  /** An event type newer than the console. */
  unknownType: 'msg_ops_05',
  /** An event Svix no longer names. */
  noType: 'msg_ops_06',
  /** Failed once with a 500 and a body. */
  failedOnce: 'msg_ops_07',
} as const;

type Attempt = MockedMessage['attempts'][number];

const ok = (
  id: string,
  minutes: number,
  extra: Partial<Attempt> = {},
): Attempt => ({
  id,
  timestamp: at(minutes, 1),
  status: 'success',
  responseStatusCode: 200,
  response: 'ok',
  responseDurationMs: 84,
  triggerType: 'scheduled',
  ...extra,
});

function payloadFor(eventType: string, index: number) {
  return {
    id: `evt_ops_${String(index).padStart(2, '0')}`,
    type: eventType,
    occurredAt: at(3 + index * 10),
    data: { instance: { slug: `acme-prod-${index}`, region: 'eu-west-1' } },
  };
}

/** The 25 messages of Ops alerts, newest first, ten minutes apart from 3 minutes ago. */
function opsMessages(): MockedMessage[] {
  return Array.from({ length: 25 }, (_, index) => {
    const minutes = 3 + index * 10;
    const id = `msg_ops_${String(index).padStart(2, '0')}`;
    const attemptId = (suffix: string) =>
      `atmpt_ops_${String(index).padStart(2, '0')}_${suffix}`;
    const eventType = EVENT_CYCLE[index % EVENT_CYCLE.length];
    const base: MockedMessage = {
      hookId: 'ep_ops',
      messageId: id,
      eventType,
      timestamp: at(minutes),
      payload: payloadFor(eventType, index),
      attempts: [ok(attemptId('1'), minutes)],
    };

    switch (id) {
      case OPS_MESSAGES.newest:
        return {
          ...base,
          // Long enough to scroll inside its box.
          payload: {
            ...payloadFor(eventType, index),
            entitlements: Array.from({ length: 40 }, (_, n) => ({
              slug: `feature-${n}`,
              value: n % 2 === 0,
            })),
          },
        };
      case OPS_MESSAGES.sending:
        return {
          ...base,
          attempts: [
            {
              id: attemptId('1'),
              timestamp: at(minutes, 1),
              status: 'sending',
              triggerType: 'scheduled',
            },
          ],
        };
      case OPS_MESSAGES.failed:
        return {
          ...base,
          attempts: [
            {
              ...ok(attemptId('1'), minutes),
              status: 'fail',
              responseStatusCode: 503,
              response: 'Service unavailable',
              responseDurationMs: 1_204,
            },
            {
              ...ok(attemptId('2'), minutes - 1),
              status: 'fail',
              responseStatusCode: 503,
              response: 'Service unavailable',
              responseDurationMs: 1_190,
            },
            {
              id: attemptId('3'),
              timestamp: at(minutes - 2, 1),
              status: 'fail',
              triggerType: 'scheduled',
            },
          ],
        };
      case OPS_MESSAGES.retrying:
        return {
          ...base,
          status: 'pending',
          nextAttempt: at(-30),
          attempts: [
            {
              ...ok(attemptId('1'), minutes),
              status: 'fail',
              responseStatusCode: 502,
              response: 'Bad gateway',
              responseDurationMs: 310,
            },
          ],
        };
      case OPS_MESSAGES.resent:
        return {
          ...base,
          attempts: [
            {
              ...ok(attemptId('1'), minutes),
              status: 'fail',
              responseStatusCode: 500,
              response: 'Internal server error',
              responseDurationMs: 640,
            },
            {
              ...ok(attemptId('2'), minutes - 1),
              status: 'fail',
              responseStatusCode: 500,
              response: 'Internal server error',
              responseDurationMs: 655,
            },
            ok(attemptId('3'), minutes - 5, {
              triggerType: 'manual',
              responseDurationMs: 97,
            }),
          ],
        };
      case OPS_MESSAGES.unknownType:
        return { ...base, eventType: 'com.kaiten.gadget.v1.created' };
      case OPS_MESSAGES.noType:
        return { ...base, eventType: '' };
      case OPS_MESSAGES.failedOnce:
      case 'msg_ops_21':
      case 'msg_ops_23':
        return {
          ...base,
          attempts: [
            {
              ...ok(attemptId('1'), minutes),
              status: 'fail',
              responseStatusCode: 500,
              response: 'Internal server error while syncing the instance.',
              responseDurationMs: 1_204,
            },
          ],
        };
      default:
        return base;
    }
  });
}

/** Two messages of yesterday whose payload Svix no longer keeps. */
function auditMessages(): MockedMessage[] {
  return [0, 1].map((index) => ({
    hookId: 'ep_audit',
    messageId: `msg_audit_${index}`,
    eventType: CUSTOMER_UPDATED,
    timestamp: at(24 * 60 + index * 10),
    payload: null,
    attempts: [ok(`atmpt_audit_${index}`, 24 * 60 + index * 10)],
  }));
}

/**
 * Three webhooks and their deliveries. Ops alerts: 25 messages, the 20 most
 * recent with 2 failures, one being sent, one retrying, one delivered by a
 * manual resend, one of an unknown type and one Svix no longer names; 19 of
 * 25 delivered. CRM sync: none. Audit: two of yesterday, bodies expired.
 */
export function createWebhooksDeliveriesModel() {
  return new WebhooksAppModel({
    webhooks: [
      {
        id: 'ep_ops',
        url: OPS_WEBHOOK_URL,
        eventTypes: EVENT_CYCLE,
        createdAt: '2026-11-02T09:14:03Z',
        updatedAt: '2026-11-20T16:01:44Z',
      },
      {
        id: 'ep_crm',
        url: CRM_WEBHOOK_URL,
        eventTypes: [CUSTOMER_UPDATED],
        createdAt: '2026-11-10T08:00:00Z',
        updatedAt: '2026-11-10T08:00:00Z',
      },
      {
        id: 'ep_audit',
        url: AUDIT_WEBHOOK_URL,
        eventTypes: [CUSTOMER_UPDATED],
        createdAt: '2026-10-01T08:00:00Z',
        updatedAt: '2026-10-01T08:00:00Z',
      },
    ],
    messages: [...opsMessages(), ...auditMessages()],
  });
}

/**
 * The history of an older saas-api: attempts without message or attempt ids,
 * so the console reads no message. One webhook, the same deliveries.
 */
export function createWebhooksLegacyHistoryModel() {
  return new WebhooksAppModel({
    webhooks: [
      {
        id: 'ep_ops',
        url: OPS_WEBHOOK_URL,
        eventTypes: EVENT_CYCLE,
        createdAt: '2026-11-02T09:14:03Z',
        updatedAt: '2026-11-20T16:01:44Z',
      },
    ],
    messages: opsMessages().slice(0, 8),
    legacyHistory: true,
  });
}

/**
 * One webhook whose deliveries cannot be read at first: the list is refused
 * twice (the cell's read and its one retry), then answers.
 */
export function createWebhooksDeliveriesUnavailableModel() {
  const model = new WebhooksAppModel({
    webhooks: [
      {
        id: 'ep_ops',
        url: OPS_WEBHOOK_URL,
        eventTypes: EVENT_CYCLE,
        createdAt: '2026-11-02T09:14:03Z',
        updatedAt: '2026-11-20T16:01:44Z',
      },
    ],
    messages: opsMessages().slice(0, 4),
  });
  model.refuseNext('listMessages', 'messagesLookupFailed', 2);

  return model;
}
