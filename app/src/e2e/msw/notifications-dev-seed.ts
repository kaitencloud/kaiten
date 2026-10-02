import {
  NotificationAppModel,
  type NotificationAppModelSeed,
  type SerializedNotificationAppModel,
} from '../../../e2e/app/_support/model/notification-app-model';
import { startE2EMockServiceWorker } from './browser';

type Notification = NonNullable<
  NotificationAppModelSeed['notifications']
>[number];

const STREAM_DEMO_INTERVAL_MS = 45_000;

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function seedNotifications(): Notification[] {
  const recent: Notification[] = [
    {
      id: 'ntf-seed-100',
      eventName: 'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
      eventType:
        'com.kaiten.instance.entitlement.v1.usage_warning_threshold_reached',
      objectType: 'instance',
      title: 'Acme Production is close to its Webhooks limit',
      body: 'Webhooks usage is at 9 of 10 (90%).',
      actionUrl: '/customers',
      createdAt: minutesAgo(12),
    },
    {
      id: 'ntf-seed-099',
      eventName: 'INSTANCE_ENTITLEMENT_CAP_EXCEEDED',
      eventType: 'com.kaiten.instance.entitlement.v1.cap_exceeded',
      objectType: 'instance',
      title: 'TechStart Prod reached its API calls limit',
      body: 'API calls usage is at 1,000,000 of 1,000,000.',
      actionUrl: '/customers',
      createdAt: minutesAgo(75),
    },
    {
      id: 'ntf-seed-098',
      eventName: 'INSTANCE_STATUS_CHANGED',
      eventType: 'com.kaiten.instance.v1.status_changed',
      objectType: 'instance',
      title: 'Webhook delivery to api.example.com failed',
      body: 'instance.updated → 502 Bad Gateway.',
      actionUrl: '/integrations/webhooks/history',
      createdAt: minutesAgo(140),
    },
    {
      id: 'ntf-seed-097',
      eventName: 'INSTANCE_DEPLOYED',
      eventType: 'com.kaiten.instance.v1.deployed',
      objectType: 'instance',
      title: 'Deployment of acme-prod succeeded',
      body: 'Instance acme-prod was updated to release 2.4.1.',
      actionUrl: '/releases',
      readAt: minutesAgo(60),
      createdAt: minutesAgo(300),
    },
    {
      id: 'ntf-seed-096',
      eventName: 'INSTANCE_CREATED',
      eventType: 'com.kaiten.instance.v1.created',
      objectType: 'instance',
      title: 'New instance beta-eu created',
      body: 'Beta Industries provisioned beta-eu.',
      actionUrl: '/customers',
      readAt: minutesAgo(200),
      createdAt: minutesAgo(60 * 26),
    },
    {
      id: 'ntf-seed-095',
      eventName: 'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
      eventType:
        'com.kaiten.instance.entitlement.v1.usage_warning_threshold_reached',
      objectType: 'instance',
      title: 'Globex Staging is close to its Active users limit',
      body: 'Active users usage is at 170 of 200 (85%).',
      actionUrl: '/customers',
      readAt: minutesAgo(60 * 30),
      createdAt: minutesAgo(60 * 49),
    },
  ];

  // Older read history so cursor pagination ("Load more") has pages to serve.
  const history = Array.from({ length: 28 }, (_, index): Notification => {
    const daysAgo = 3 + index;
    return {
      id: `ntf-seed-${String(90 - index).padStart(3, '0')}`,
      eventName: index % 3 === 0 ? 'INSTANCE_CREATED' : 'INSTANCE_DEPLOYED',
      eventType:
        index % 3 === 0
          ? 'com.kaiten.instance.v1.created'
          : 'com.kaiten.instance.v1.deployed',
      objectType: 'instance',
      title:
        index % 3 === 0
          ? `New instance sandbox-${index} created`
          : `Deployment of acme-prod succeeded`,
      body:
        index % 3 === 0
          ? `Acme Corp provisioned sandbox-${index}.`
          : `Instance acme-prod was updated to release 2.${28 - index}.0.`,
      actionUrl: index % 3 === 0 ? '/customers' : '/releases',
      readAt: minutesAgo(60 * 24 * daysAgo - 30),
      createdAt: minutesAgo(60 * 24 * daysAgo),
    };
  });

  return [...recent, ...history];
}

export function createNotificationsDevSeed(): SerializedNotificationAppModel {
  return new NotificationAppModel({
    notifications: seedNotifications(),
    streamDemoIntervalMs: STREAM_DEMO_INTERVAL_MS,
  }).serializeForMsw();
}

/**
 * The notifications UI over a running stack (VITE_MOCK_NOTIFICATIONS=true):
 * starts the shared MSW worker with only the notifications slot seeded, and its
 * demo stream. Every other request passes through to the real API
 * (onUnhandledFrame: 'bypass'). `pnpm run dev:mock` serves this seed too, with
 * every other area (./dev.ts).
 */
export async function startNotificationsDevMocks() {
  await startE2EMockServiceWorker(
    { notifications: createNotificationsDevSeed() },
    // The stack's own platform flags, not the e2e default: on a SaaS stack they
    // are what shows webhooks, whose deliveries these notifications link to.
    { unmockedFlags: 'passthrough' },
  );
}
