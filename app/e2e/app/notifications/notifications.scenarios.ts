import type { Notification } from '@/features/notifications/types';
import { NotificationAppModel } from '../_support/model/notification-app-model';

// Each actionUrl is what the API renders for that kind of event: the object the
// notification is about, and for a usage event the instance's usage tab.
const seedNotifications: Notification[] = [
  {
    id: 'ntf-e2e-004',
    eventName: 'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
    eventType:
      'com.kaiten.instance.entitlement.v1.usage_warning_threshold_reached',
    objectType: 'instance',
    title: 'Acme Production is close to its Webhooks limit',
    body: 'Webhooks usage is at 9 of 10 (90%).',
    actionUrl: '/customers/instances/acme-prod/entitlements',
    createdAt: '2026-03-01T09:30:00.000Z',
  },
  {
    id: 'ntf-e2e-003',
    eventName: 'INSTANCE_ENTITLEMENT_CAP_EXCEEDED',
    eventType: 'com.kaiten.instance.entitlement.v1.cap_exceeded',
    objectType: 'instance',
    title: 'TechStart Prod reached its API calls limit',
    body: 'API calls usage is at 1,000,000 of 1,000,000.',
    actionUrl: '/customers/instances/techstart-prod/entitlements',
    createdAt: '2026-03-01T08:15:00.000Z',
  },
  {
    id: 'ntf-e2e-002',
    eventName: 'INSTANCE_STATUS_CHANGED',
    eventType: 'com.kaiten.instance.v1.status_changed',
    objectType: 'instance',
    title: 'Webhook delivery to api.example.com failed',
    body: 'instance.updated → 502 Bad Gateway.',
    actionUrl: '/integrations/webhooks/history',
    createdAt: '2026-03-01T07:45:00.000Z',
  },
  {
    id: 'ntf-e2e-001',
    eventName: 'INSTANCE_DEPLOYED',
    eventType: 'com.kaiten.instance.v1.deployed',
    objectType: 'instance',
    title: 'Deployment of acme-prod succeeded',
    body: 'Instance acme-prod was updated to release 2.4.1.',
    actionUrl: '/customers/instances/acme-prod',
    readAt: '2026-03-01T07:00:00.000Z',
    createdAt: '2026-02-28T18:00:00.000Z',
  },
];

export function createNotificationsFeedModel() {
  return new NotificationAppModel({ notifications: seedNotifications });
}

// One notification per kind of object, for the object filter.
const mixedObjectNotifications: Notification[] = [
  {
    id: 'ntf-e2e-mixed-003',
    eventName: 'INSTANCE_DEPLOYED',
    eventType: 'com.kaiten.instance.v1.deployed',
    objectType: 'instance',
    title: 'Acme Production was deployed',
    body: 'Deployed to eu-west',
    actionUrl: '/customers/instances/acme-prod',
    createdAt: '2026-03-01T09:30:00.000Z',
  },
  {
    id: 'ntf-e2e-mixed-002',
    eventName: 'CUSTOMER_CREATED',
    eventType: 'com.kaiten.customer.v1.created',
    objectType: 'customer',
    title: 'Globex was added as a customer',
    actionUrl: '/customers/globex',
    createdAt: '2026-03-01T08:15:00.000Z',
  },
  {
    id: 'ntf-e2e-mixed-001',
    eventName: 'RELEASE_CREATED',
    eventType: 'com.kaiten.release.v1.created',
    objectType: 'release',
    title: 'Release 2.5.0 was published',
    actionUrl: '/releases/2-5-0',
    createdAt: '2026-03-01T07:45:00.000Z',
  },
];

export function createMixedObjectsFeedModel() {
  return new NotificationAppModel({ notifications: mixedObjectNotifications });
}
