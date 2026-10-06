import type { Customer, Instance, License, Notification } from '@/api-client';
import { TEST_USER } from '../../../../e2e/app/_support/fixtures';
import type { AuditTrailSeedEntry } from '../../../../e2e/app/_support/model/audit-trail-app-model';
import type { ReleaseManagementDeploymentRecord } from '../../../../e2e/app/_support/model/release-management-app-model';
import { bySlug } from './by-slug';
import { currentMonth, daysAgo, minutesAgo } from './dates';
import type { FeatureFlagRecord } from './feature-flags';

type ActivitySources = {
  customers: Customer[];
  deployments: ReleaseManagementDeploymentRecord[];
  featureFlags: FeatureFlagRecord[];
  instances: Instance[];
  licenses: License[];
};

const NO_INSTANCE = {
  customerName: null,
  instanceId: null,
  instanceName: null,
  instanceSlug: null,
};

/**
 * What the organization's audit trail recorded about the world: the usage
 * that the instances' entitlements tabs show, the flag changed minutes ago, the
 * last deployment, the newest customer and the newest license version.
 */
export const createAuditTrail = ({
  customers,
  deployments,
  featureFlags,
  instances,
  licenses,
}: ActivitySources): AuditTrailSeedEntry[] => {
  const on = (slug: string) => {
    const instance = bySlug(instances, slug);
    return {
      customerName:
        customers.find((customer) => customer.id === instance.customerId)
          ?.name ?? null,
      instanceId: instance.id,
      instanceName: instance.name,
      instanceSlug: slug,
    };
  };
  const flag = bySlug(featureFlags, 'new-checkout');
  const gamma = bySlug(customers, 'gamma-labs');
  const enterprise = bySlug(licenses, 'enterprise-v2');
  const lastDeployment = deployments.at(-1);

  return [
    {
      ...on('acme-production'),
      eventName: 'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
      eventType:
        'com.kaiten.instance.entitlement.v1.usage_warning_threshold_reached',
      id: 'dev-audit-10',
      payload: {
        boundary: 225,
        entitlement_slug: 'seats',
        threshold: 250,
        value: 238,
      },
      timestamp: minutesAgo(5),
    },
    {
      ...on('acme-production'),
      eventName: 'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
      eventType: 'com.kaiten.instance.entitlement.v1.usage_report_accepted',
      id: 'dev-audit-09',
      payload: {
        behavior: 'set',
        entitlement_slug: 'seats',
        event_count: 1,
        status: 'ACCEPTED',
        value: 238,
      },
      timestamp: minutesAgo(6),
    },
    {
      ...NO_INSTANCE,
      eventName: 'FEATURE_FLAG_UPDATED',
      eventType: 'com.kaiten.feature_flag.v1.updated',
      id: 'dev-audit-08',
      payload: {
        default_variant: flag.default_variant,
        description: flag.description,
        enabled: flag.enabled,
        event_name: flag.event_name,
        metadata: flag.metadata,
        name: flag.name,
        slug: flag.slug,
        targetings: flag.targetings,
        type: flag.type,
        variants: flag.variants,
      },
      timestamp: flag.updatedAt,
    },
    {
      ...on('globex-production'),
      eventName: 'INSTANCE_ENTITLEMENT_CAP_EXCEEDED',
      eventType: 'com.kaiten.instance.entitlement.v1.cap_exceeded',
      id: 'dev-audit-07',
      payload: {
        entitlement_slug: 'api-calls',
        overage: 4_200,
        threshold: 100_000,
        value: 104_200,
      },
      timestamp: minutesAgo(48),
    },
    {
      ...on('beta-staging'),
      eventName: 'ENTITLEMENT_USAGE_REPORT_REJECTED',
      eventType: 'com.kaiten.instance.entitlement.v1.usage_report_rejected',
      id: 'dev-audit-06',
      payload: {
        behavior: 'set',
        entitlement_slug: 'seats',
        event_count: 1,
        status: 'REJECTED',
        value: 4,
      },
      timestamp: minutesAgo(130),
    },
    {
      ...on('beta-staging'),
      eventName: 'INSTANCE_ENTITLEMENT_USAGE_REACHED',
      eventType: 'com.kaiten.instance.entitlement.v1.usage_reached',
      id: 'dev-audit-05',
      // The whole usage, as the report that reached the limit returns it.
      payload: {
        ...currentMonth(),
        entitlementId: 'entitlement-api-calls',
        entitlementSlug: 'api-calls',
        licenseId: 'license-trial-v1',
        licenseSlug: 'trial',
        limit: { type: 'number', value: 1_000 },
        value: { event_count: 214, type: 'number', value: 1_000 },
      },
      timestamp: minutesAgo(200),
    },
    {
      ...NO_INSTANCE,
      customerName: gamma.name,
      eventName: 'CUSTOMER_CREATED',
      eventType: 'com.kaiten.customer.v1.created',
      id: 'dev-audit-04',
      payload: {
        createdAt: gamma.createdAt,
        createdBy: gamma.createdBy,
        externalCustomerId: gamma.externalCustomerId ?? null,
        id: gamma.id,
        name: gamma.name,
        slug: gamma.slug,
        updatedAt: gamma.updatedAt,
        updatedBy: gamma.updatedBy,
      },
      timestamp: gamma.createdAt,
    },
    ...(lastDeployment
      ? [
          {
            ...NO_INSTANCE,
            eventName: 'RELEASE_DEPLOYED' as const,
            eventType: 'com.kaiten.deployment_zone.v1.release_deployed',
            id: 'dev-audit-03',
            payload: {
              ...lastDeployment,
              createdBy: TEST_USER,
              id: 'deployment-dev-latest',
            },
            timestamp: lastDeployment.createdAt,
          },
        ]
      : []),
    {
      ...NO_INSTANCE,
      eventName: 'LICENSE_PUBLISHED',
      eventType: 'com.kaiten.license.v1.published',
      id: 'dev-audit-02',
      payload: {
        description: enterprise.description,
        familySlug: 'enterprise',
        isDefault: enterprise.isDefault,
        lifecycleState: 'PUBLISHED',
        name: enterprise.name,
        slug: enterprise.slug,
        type: enterprise.type,
        versionName: enterprise.versionName,
      },
      timestamp: enterprise.createdAt,
    },
  ];
};

type NotificationContent = Pick<
  Notification,
  'actionUrl' | 'body' | 'eventName' | 'eventType' | 'objectType' | 'title'
>;

const instanceUrl = (slug: string, tab = '') =>
  `/customers/instances/${slug}${tab}`;

// The unread news, by how many minutes ago it happened: the audit trail
// records the two usage events at the same times.
const NEWS: Array<[number, NotificationContent]> = [
  [
    5,
    {
      actionUrl: instanceUrl('acme-production', '/entitlements'),
      body: 'Seats usage is at 238 of 250 (95%).',
      eventName: 'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
      eventType:
        'com.kaiten.instance.entitlement.v1.usage_warning_threshold_reached',
      objectType: 'instance',
      title: 'Acme Production is close to its Seats limit',
    },
  ],
  [
    48,
    {
      actionUrl: instanceUrl('globex-production', '/entitlements'),
      body: 'API Calls usage is at 104,200 of 100,000.',
      eventName: 'INSTANCE_ENTITLEMENT_CAP_EXCEEDED',
      eventType: 'com.kaiten.instance.entitlement.v1.cap_exceeded',
      objectType: 'instance',
      title: 'Globex Production went past its API Calls limit',
    },
  ],
  [
    140,
    {
      actionUrl: instanceUrl('beta-staging'),
      body: 'Its status went from Healthy to Degraded.',
      eventName: 'INSTANCE_STATUS_CHANGED',
      eventType: 'com.kaiten.instance.v1.status_changed',
      objectType: 'instance',
      title: 'Beta Staging is degraded',
    },
  ],
];

/** What the demo stream of the bell repeats: the same news. */
export const NOTIFICATION_STREAM_TEMPLATES = NEWS.map(([, content]) => content);

/**
 * The bell's notifications: the news unread, then read history on the same
 * instances, old enough for "Load more" to have pages to serve.
 */
export const createNotifications = (instances: Instance[]): Notification[] => {
  const news = NEWS.map(([age, content], index) => ({
    ...content,
    createdAt: minutesAgo(age),
    id: `ntf-dev-${200 - index}`,
  }));
  const read: Notification[] = [
    {
      actionUrl: '/releases/release-1-5-0-rc1',
      body: 'Beta Staging and Globex Staging now run v1.5.0-rc1.',
      createdAt: daysAgo(8),
      eventName: 'INSTANCE_DEPLOYED',
      eventType: 'com.kaiten.instance.v1.deployed',
      id: 'ntf-dev-150',
      objectType: 'instance',
      readAt: daysAgo(7),
      title: 'Staging now runs v1.5.0-rc1',
    },
    {
      actionUrl: instanceUrl('beta-staging'),
      body: 'Beta Industries provisioned Beta Staging on a Trial license.',
      createdAt: daysAgo(20),
      eventName: 'INSTANCE_CREATED',
      eventType: 'com.kaiten.instance.v1.created',
      id: 'ntf-dev-149',
      objectType: 'instance',
      readAt: daysAgo(19),
      title: 'New instance Beta Staging created',
    },
  ];
  // Acme's instances are older than the whole history.
  const veterans = ['acme-production', 'acme-us', 'acme-legacy'].map((slug) =>
    bySlug(instances, slug),
  );
  const history = Array.from({ length: 28 }, (_, index): Notification => {
    const instance = veterans[index % veterans.length];
    return {
      actionUrl: instanceUrl(instance.slug ?? instance.id),
      body: 'Its status went from Degraded to Healthy.',
      createdAt: daysAgo(21 + index),
      eventName: 'INSTANCE_STATUS_CHANGED',
      eventType: 'com.kaiten.instance.v1.status_changed',
      id: `ntf-dev-${String(100 - index).padStart(3, '0')}`,
      objectType: 'instance',
      readAt: daysAgo(20 + index),
      title: `${instance.name} is healthy again`,
    };
  });
  return [...news, ...read, ...history];
};
