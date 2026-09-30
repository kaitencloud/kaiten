import {
  AuditTrailAppModel,
  type AuditTrailSeedEntry,
} from '../_support/model/audit-trail-app-model';

const ACME = {
  customerName: 'Acme Corp',
  instanceId: 'inst-acme-production',
  instanceName: 'Acme Production',
  instanceSlug: 'acme-production',
};
const TECHSTART = {
  customerName: 'TechStart',
  instanceId: 'inst-techstart-prod',
  instanceName: 'TechStart Prod',
  instanceSlug: 'techstart-prod',
};
const GLOBEX = {
  customerName: 'Globex',
  instanceId: 'inst-globex-prod',
  instanceName: 'Globex Prod',
  instanceSlug: 'globex-prod',
};

/**
 * One event of every status the page shows. Three of them tell a user that an
 * entitlement's usage is approaching, at or past its limit, while the API still
 * accepts the usage: an early warning, the limit reached, and a soft limit
 * exceeded. A usage report the API refused is a rejection, not a warning.
 *
 * Each payload is what the API emits for its event, and the model checks it
 * against the OpenAPI schema: `seats` has a cap of 50, reached exactly at 50,
 * and a report that sets it to 60 is refused.
 */
const USAGE_ENTRIES: AuditTrailSeedEntry[] = [
  {
    ...ACME,
    eventName: 'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
    eventType:
      'com.kaiten.instance.entitlement.v1.usage_warning_threshold_reached',
    id: '2001',
    payload: {
      boundary: 9,
      entitlement_slug: 'webhooks',
      threshold: 10,
      value: 9,
    },
    timestamp: '2026-09-29T10:05:00.000Z',
  },
  {
    ...TECHSTART,
    eventName: 'INSTANCE_ENTITLEMENT_USAGE_REACHED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_reached',
    id: '2002',
    // The whole usage, as the report that reached the cap returns it.
    payload: {
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
      currentPeriodStart: '2026-09-01T00:00:00.000Z',
      entitlementId: 'ent-seats',
      entitlementSlug: 'seats',
      licenseId: 'lic-business',
      licenseSlug: 'business',
      limit: { type: 'number', value: 50 },
      value: { event_count: 12, type: 'number', value: 50 },
    },
    timestamp: '2026-09-29T10:04:00.000Z',
  },
  {
    ...GLOBEX,
    eventName: 'INSTANCE_ENTITLEMENT_CAP_EXCEEDED',
    eventType: 'com.kaiten.instance.entitlement.v1.cap_exceeded',
    id: '2003',
    payload: {
      entitlement_slug: 'api-calls',
      overage: 4200,
      threshold: 100000,
      value: 104200,
    },
    timestamp: '2026-09-29T10:03:00.000Z',
  },
  {
    ...ACME,
    eventName: 'ENTITLEMENT_USAGE_REPORT_REJECTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_rejected',
    id: '2004',
    payload: {
      behavior: 'set',
      entitlement_slug: 'seats',
      event_count: 1,
      status: 'REJECTED',
      value: 60,
    },
    timestamp: '2026-09-29T10:02:00.000Z',
  },
  {
    ...ACME,
    eventName: 'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_accepted',
    id: '2005',
    payload: {
      behavior: 'set',
      entitlement_slug: 'seats',
      event_count: 1,
      status: 'ACCEPTED',
      value: 42,
    },
    timestamp: '2026-09-29T10:01:00.000Z',
  },
  {
    ...TECHSTART,
    eventName: 'FEATURE_FLAG_UPDATED',
    eventType: 'com.kaiten.feature_flag.v1.updated',
    id: '2006',
    payload: {
      default_variant: { type: 'basic', value: 'off' },
      description: 'Routes shoppers to the new checkout',
      enabled: true,
      event_name: 'new_checkout_evaluated',
      metadata: {},
      name: 'New checkout',
      slug: 'new-checkout',
      targetings: [],
      type: 'boolean',
      variants: [
        { description: 'Old checkout', name: 'off', value: false },
        { description: 'New checkout', name: 'on', value: true },
      ],
    },
    timestamp: '2026-09-29T10:00:00.000Z',
  },
  {
    // Organization-level: no instance, no customer.
    customerName: null,
    eventName: 'LICENSE_PUBLISHED',
    eventType: 'com.kaiten.license.v1.published',
    id: '2007',
    instanceId: null,
    instanceName: null,
    instanceSlug: null,
    payload: {
      description: 'Everything in Starter, with priority support',
      familySlug: 'business',
      isDefault: false,
      lifecycleState: 'PUBLISHED',
      name: 'Business',
      slug: 'business',
      type: 'PAID',
      versionName: '2026.10',
    },
    timestamp: '2026-09-29T09:59:00.000Z',
  },
];

export function createUsageEventsAuditTrailModel() {
  return new AuditTrailAppModel(USAGE_ENTRIES);
}
