import type { TFunction } from 'i18next';
import type { Webhooks } from '@/api-client';

/** An event the API emits, named as the audit trail records it (`LICENSE_CREATED`). */
export type AuditEventName = Webhooks['body']['name'];

// One label per event the API emits. The OpenAPI declares every event as a
// webhook, so a new one fails typecheck here until it has a label.
export const AUDIT_EVENT_LABEL_KEYS = {
  COMPONENT_CREATED: 'Features.AuditTrail.events.COMPONENT_CREATED',
  COMPONENT_DELETED: 'Features.AuditTrail.events.COMPONENT_DELETED',
  COMPONENT_UPDATED: 'Features.AuditTrail.events.COMPONENT_UPDATED',
  CUSTOMER_CREATED: 'Features.AuditTrail.events.CUSTOMER_CREATED',
  CUSTOMER_CREATION_REJECTED:
    'Features.AuditTrail.events.CUSTOMER_CREATION_REJECTED',
  CUSTOMER_DELETED: 'Features.AuditTrail.events.CUSTOMER_DELETED',
  CUSTOMER_UPDATED: 'Features.AuditTrail.events.CUSTOMER_UPDATED',
  DEPLOYMENT_ZONE_CREATED: 'Features.AuditTrail.events.DEPLOYMENT_ZONE_CREATED',
  DEPLOYMENT_ZONE_DELETED: 'Features.AuditTrail.events.DEPLOYMENT_ZONE_DELETED',
  DEPLOYMENT_ZONE_UPDATED: 'Features.AuditTrail.events.DEPLOYMENT_ZONE_UPDATED',
  ENTITLEMENT_CREATED: 'Features.AuditTrail.events.ENTITLEMENT_CREATED',
  ENTITLEMENT_DELETED: 'Features.AuditTrail.events.ENTITLEMENT_DELETED',
  ENTITLEMENT_GROUP_CREATED:
    'Features.AuditTrail.events.ENTITLEMENT_GROUP_CREATED',
  ENTITLEMENT_GROUP_DELETED:
    'Features.AuditTrail.events.ENTITLEMENT_GROUP_DELETED',
  ENTITLEMENT_GROUP_UPDATED:
    'Features.AuditTrail.events.ENTITLEMENT_GROUP_UPDATED',
  ENTITLEMENT_UPDATED: 'Features.AuditTrail.events.ENTITLEMENT_UPDATED',
  ENTITLEMENT_USAGE_REPORT_ACCEPTED:
    'Features.AuditTrail.events.ENTITLEMENT_USAGE_REPORT_ACCEPTED',
  ENTITLEMENT_USAGE_REPORT_REJECTED:
    'Features.AuditTrail.events.ENTITLEMENT_USAGE_REPORT_REJECTED',
  ENTITLEMENT_VALUE_GET: 'Features.AuditTrail.events.ENTITLEMENT_VALUE_GET',
  FEATURE_FLAG_CREATED: 'Features.AuditTrail.events.FEATURE_FLAG_CREATED',
  FEATURE_FLAG_DELETED: 'Features.AuditTrail.events.FEATURE_FLAG_DELETED',
  FEATURE_FLAG_EVALUATED: 'Features.AuditTrail.events.FEATURE_FLAG_EVALUATED',
  FEATURE_FLAG_UPDATED: 'Features.AuditTrail.events.FEATURE_FLAG_UPDATED',
  INSTANCE_BILLING_STARTED:
    'Features.AuditTrail.events.INSTANCE_BILLING_STARTED',
  INSTANCE_CREATED: 'Features.AuditTrail.events.INSTANCE_CREATED',
  INSTANCE_DELETED: 'Features.AuditTrail.events.INSTANCE_DELETED',
  INSTANCE_DEPLOYED: 'Features.AuditTrail.events.INSTANCE_DEPLOYED',
  INSTANCE_ENTITLEMENT_CAP_EXCEEDED:
    'Features.AuditTrail.events.INSTANCE_ENTITLEMENT_CAP_EXCEEDED',
  INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER:
    'Features.AuditTrail.events.INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER',
  INSTANCE_ENTITLEMENT_USAGE_REACHED:
    'Features.AuditTrail.events.INSTANCE_ENTITLEMENT_USAGE_REACHED',
  INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED:
    'Features.AuditTrail.events.INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
  INSTANCE_INVOICE_HANDOFF_ACKNOWLEDGED:
    'Features.AuditTrail.events.INSTANCE_INVOICE_HANDOFF_ACKNOWLEDGED',
  INSTANCE_INVOICE_HELD: 'Features.AuditTrail.events.INSTANCE_INVOICE_HELD',
  INSTANCE_INVOICE_ISSUED: 'Features.AuditTrail.events.INSTANCE_INVOICE_ISSUED',
  INSTANCE_INVOICE_MARKED_UNCOLLECTIBLE:
    'Features.AuditTrail.events.INSTANCE_INVOICE_MARKED_UNCOLLECTIBLE',
  INSTANCE_INVOICE_PAID: 'Features.AuditTrail.events.INSTANCE_INVOICE_PAID',
  INSTANCE_INVOICE_RELEASED:
    'Features.AuditTrail.events.INSTANCE_INVOICE_RELEASED',
  INSTANCE_INVOICE_VOIDED: 'Features.AuditTrail.events.INSTANCE_INVOICE_VOIDED',
  INSTANCE_LIFECYCLE_STAGE_CHANGED:
    'Features.AuditTrail.events.INSTANCE_LIFECYCLE_STAGE_CHANGED',
  INSTANCE_MIGRATED: 'Features.AuditTrail.events.INSTANCE_MIGRATED',
  INSTANCE_STATUS_CHANGED: 'Features.AuditTrail.events.INSTANCE_STATUS_CHANGED',
  INSTANCE_UPDATED: 'Features.AuditTrail.events.INSTANCE_UPDATED',
  LICENSE_ARCHIVED: 'Features.AuditTrail.events.LICENSE_ARCHIVED',
  LICENSE_CREATED: 'Features.AuditTrail.events.LICENSE_CREATED',
  LICENSE_DELETED: 'Features.AuditTrail.events.LICENSE_DELETED',
  LICENSE_ENTITLEMENT_ASSIGNED:
    'Features.AuditTrail.events.LICENSE_ENTITLEMENT_ASSIGNED',
  LICENSE_ENTITLEMENT_UNASSIGNED:
    'Features.AuditTrail.events.LICENSE_ENTITLEMENT_UNASSIGNED',
  LICENSE_ENTITLEMENT_UPDATED:
    'Features.AuditTrail.events.LICENSE_ENTITLEMENT_UPDATED',
  LICENSE_FAMILY_CREATED: 'Features.AuditTrail.events.LICENSE_FAMILY_CREATED',
  LICENSE_FAMILY_DELETED: 'Features.AuditTrail.events.LICENSE_FAMILY_DELETED',
  LICENSE_FAMILY_UPDATED: 'Features.AuditTrail.events.LICENSE_FAMILY_UPDATED',
  LICENSE_PRICE_CREATED: 'Features.AuditTrail.events.LICENSE_PRICE_CREATED',
  LICENSE_PRICE_DEPRECATED:
    'Features.AuditTrail.events.LICENSE_PRICE_DEPRECATED',
  LICENSE_PRICE_UPDATED: 'Features.AuditTrail.events.LICENSE_PRICE_UPDATED',
  LICENSE_PUBLISHED: 'Features.AuditTrail.events.LICENSE_PUBLISHED',
  LICENSE_UNARCHIVED: 'Features.AuditTrail.events.LICENSE_UNARCHIVED',
  LICENSE_UPDATED: 'Features.AuditTrail.events.LICENSE_UPDATED',
  METADATA_FIELD_ARCHIVED: 'Features.AuditTrail.events.METADATA_FIELD_ARCHIVED',
  METADATA_FIELD_CREATED: 'Features.AuditTrail.events.METADATA_FIELD_CREATED',
  METADATA_FIELD_REORDERED:
    'Features.AuditTrail.events.METADATA_FIELD_REORDERED',
  METADATA_FIELD_UNARCHIVED:
    'Features.AuditTrail.events.METADATA_FIELD_UNARCHIVED',
  METADATA_FIELD_UPDATED: 'Features.AuditTrail.events.METADATA_FIELD_UPDATED',
  RELEASE_CREATED: 'Features.AuditTrail.events.RELEASE_CREATED',
  RELEASE_DELETED: 'Features.AuditTrail.events.RELEASE_DELETED',
  RELEASE_DEPLOYED: 'Features.AuditTrail.events.RELEASE_DEPLOYED',
  SYSTEM_ORGANIZATION_TOKEN_ISSUED:
    'Features.AuditTrail.events.SYSTEM_ORGANIZATION_TOKEN_ISSUED',
} as const satisfies Record<AuditEventName, string>;

const isAuditEventName = (eventName: string): eventName is AuditEventName =>
  Object.hasOwn(AUDIT_EVENT_LABEL_KEYS, eventName);

// `FEATURE_FLAG_UPDATED` -> `Feature flag updated`. Only for an event newer
// than this build: the API can emit it before the console has its label.
export const humanizeEventName = (eventName: string): string => {
  const words = eventName.replaceAll('_', ' ').trim().toLowerCase();
  if (!words) {
    return eventName;
  }
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// The label every view shows for an event: the global feed, its filters and
// CSV export, and an instance's own audit tab.
export const resolveEventLabel = (eventName: string, t: TFunction): string =>
  isAuditEventName(eventName)
    ? t(AUDIT_EVENT_LABEL_KEYS[eventName])
    : humanizeEventName(eventName);
