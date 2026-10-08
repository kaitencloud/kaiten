import type { Webhooks } from '@/api-client';
import type { AuditEventName } from '@/domains/audit-trail';
import { BILLING_WEBHOOK_EVENTS } from './webhook-billing-events';

/**
 * The type a subscription filters on, as the API publishes the event: the key
 * of its webhook in the OpenAPI document (`com.kaiten.license.v1.created`),
 * which is also the Svix event type.
 */
export type WebhookEventType = Webhooks['key'];

/** The type the contract pins for the event named `Name`. */
type WebhookEventTypeOf<Name extends AuditEventName> = Extract<
  Webhooks,
  { body: { name: Name } }
>['key'];

/** The groups the subscription dialog lists events under, in display order. */
export const WEBHOOK_EVENT_GROUPS = [
  'customer',
  'instance',
  'license',
  'licenseFamily',
  'addon',
  'entitlement',
  'entitlementGroup',
  'usage',
  'subscription',
  'invoice',
  'voucher',
  'payment',
  'featureFlag',
  'release',
  'deploymentZone',
  'component',
  'metadataField',
  'identity',
] as const;

export type WebhookEventGroup = (typeof WEBHOOK_EVENT_GROUPS)[number];

/** The type and the group of each event `Name` names. */
export type WebhookEventEntries<Name extends AuditEventName = AuditEventName> =
  {
    [EventName in Name]: {
      type: WebhookEventTypeOf<EventName>;
      group: WebhookEventGroup | null;
    };
  };

// Every event the API emits: the type a subscription names it by, and the
// group the dialog lists it under.
//
// The OpenAPI document declares each event as a webhook whose body pins both
// its name and its type, so the compiler checks both halves of every pair
// below: a new event fails typecheck here until it is listed, and a mistyped
// type fails it too.
//
// A null group keeps an event out of the dialog: ENTITLEMENT_VALUE_GET fires on
// every entitlement read and FEATURE_FLAG_EVALUATED on every evaluation, so a
// subscription to either would receive a request for each one. The API still
// accepts them for a caller that means it.
export const WEBHOOK_EVENTS = {
  COMPONENT_CREATED: {
    type: 'com.kaiten.component.v1.created',
    group: 'component',
  },
  COMPONENT_DELETED: {
    type: 'com.kaiten.component.v1.deleted',
    group: 'component',
  },
  COMPONENT_UPDATED: {
    type: 'com.kaiten.component.v1.updated',
    group: 'component',
  },
  CUSTOMER_CREATED: {
    type: 'com.kaiten.customer.v1.created',
    group: 'customer',
  },
  CUSTOMER_CREATION_REJECTED: {
    type: 'com.kaiten.customer.v1.creation_rejected',
    group: 'customer',
  },
  CUSTOMER_DELETED: {
    type: 'com.kaiten.customer.v1.deleted',
    group: 'customer',
  },
  CUSTOMER_UPDATED: {
    type: 'com.kaiten.customer.v1.updated',
    group: 'customer',
  },
  DEPLOYMENT_ZONE_CREATED: {
    type: 'com.kaiten.deployment_zone.v1.created',
    group: 'deploymentZone',
  },
  DEPLOYMENT_ZONE_DELETED: {
    type: 'com.kaiten.deployment_zone.v1.deleted',
    group: 'deploymentZone',
  },
  DEPLOYMENT_ZONE_UPDATED: {
    type: 'com.kaiten.deployment_zone.v1.updated',
    group: 'deploymentZone',
  },
  ENTITLEMENT_CREATED: {
    type: 'com.kaiten.entitlement.v1.created',
    group: 'entitlement',
  },
  ENTITLEMENT_DELETED: {
    type: 'com.kaiten.entitlement.v1.deleted',
    group: 'entitlement',
  },
  ENTITLEMENT_GROUP_CREATED: {
    type: 'com.kaiten.entitlement_group.v1.created',
    group: 'entitlementGroup',
  },
  ENTITLEMENT_GROUP_DELETED: {
    type: 'com.kaiten.entitlement_group.v1.deleted',
    group: 'entitlementGroup',
  },
  ENTITLEMENT_GROUP_UPDATED: {
    type: 'com.kaiten.entitlement_group.v1.updated',
    group: 'entitlementGroup',
  },
  ENTITLEMENT_UPDATED: {
    type: 'com.kaiten.entitlement.v1.updated',
    group: 'entitlement',
  },
  ENTITLEMENT_USAGE_REPORT_ACCEPTED: {
    type: 'com.kaiten.instance.entitlement.v1.usage_report_accepted',
    group: 'usage',
  },
  ENTITLEMENT_USAGE_REPORT_REJECTED: {
    type: 'com.kaiten.instance.entitlement.v1.usage_report_rejected',
    group: 'usage',
  },
  ENTITLEMENT_VALUE_GET: {
    type: 'com.kaiten.instance.entitlement.v1.value_get',
    group: null,
  },
  FEATURE_FLAG_CREATED: {
    type: 'com.kaiten.feature_flag.v1.created',
    group: 'featureFlag',
  },
  FEATURE_FLAG_DELETED: {
    type: 'com.kaiten.feature_flag.v1.deleted',
    group: 'featureFlag',
  },
  FEATURE_FLAG_EVALUATED: {
    type: 'com.kaiten.feature_flag.v1.evaluated',
    group: null,
  },
  FEATURE_FLAG_UPDATED: {
    type: 'com.kaiten.feature_flag.v1.updated',
    group: 'featureFlag',
  },
  INSTANCE_CREATED: {
    type: 'com.kaiten.instance.v1.created',
    group: 'instance',
  },
  INSTANCE_DELETED: {
    type: 'com.kaiten.instance.v1.deleted',
    group: 'instance',
  },
  INSTANCE_DEPLOYED: {
    type: 'com.kaiten.instance.v1.deployed',
    group: 'instance',
  },
  INSTANCE_ENTITLEMENT_CAP_EXCEEDED: {
    type: 'com.kaiten.instance.entitlement.v1.cap_exceeded',
    group: 'usage',
  },
  INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER: {
    type: 'com.kaiten.instance.entitlement.v1.usage_period_rolled_over',
    group: 'usage',
  },
  INSTANCE_ENTITLEMENT_USAGE_REACHED: {
    type: 'com.kaiten.instance.entitlement.v1.usage_reached',
    group: 'usage',
  },
  INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED: {
    type: 'com.kaiten.instance.entitlement.v1.usage_warning_threshold_reached',
    group: 'usage',
  },
  INSTANCE_LIFECYCLE_STAGE_CHANGED: {
    type: 'com.kaiten.instance.v1.lifecycle_stage_changed',
    group: 'instance',
  },
  INSTANCE_MIGRATED: {
    type: 'com.kaiten.instance.v1.migrated',
    group: 'instance',
  },
  INSTANCE_STATUS_CHANGED: {
    type: 'com.kaiten.instance.v1.status_changed',
    group: 'instance',
  },
  INSTANCE_UPDATED: {
    type: 'com.kaiten.instance.v1.updated',
    group: 'instance',
  },
  LICENSE_ARCHIVED: {
    type: 'com.kaiten.license.v1.archived',
    group: 'license',
  },
  LICENSE_CREATED: { type: 'com.kaiten.license.v1.created', group: 'license' },
  LICENSE_DELETED: { type: 'com.kaiten.license.v1.deleted', group: 'license' },
  LICENSE_ENTITLEMENT_ASSIGNED: {
    type: 'com.kaiten.license.entitlement.v1.assigned',
    group: 'license',
  },
  LICENSE_ENTITLEMENT_UNASSIGNED: {
    type: 'com.kaiten.license.entitlement.v1.unassigned',
    group: 'license',
  },
  LICENSE_ENTITLEMENT_UPDATED: {
    type: 'com.kaiten.license.entitlement.v1.updated',
    group: 'license',
  },
  LICENSE_FAMILY_CREATED: {
    type: 'com.kaiten.license_family.v1.created',
    group: 'licenseFamily',
  },
  LICENSE_FAMILY_DELETED: {
    type: 'com.kaiten.license_family.v1.deleted',
    group: 'licenseFamily',
  },
  LICENSE_FAMILY_UPDATED: {
    type: 'com.kaiten.license_family.v1.updated',
    group: 'licenseFamily',
  },
  LICENSE_PRICE_CREATED: {
    type: 'com.kaiten.license.price.v1.created',
    group: 'license',
  },
  LICENSE_PRICE_DEPRECATED: {
    type: 'com.kaiten.license.price.v1.deprecated',
    group: 'license',
  },
  LICENSE_PRICE_UPDATED: {
    type: 'com.kaiten.license.price.v1.updated',
    group: 'license',
  },
  LICENSE_PUBLISHED: {
    type: 'com.kaiten.license.v1.published',
    group: 'license',
  },
  LICENSE_UNARCHIVED: {
    type: 'com.kaiten.license.v1.unarchived',
    group: 'license',
  },
  LICENSE_UPDATED: { type: 'com.kaiten.license.v1.updated', group: 'license' },
  METADATA_FIELD_ARCHIVED: {
    type: 'com.kaiten.metadata_field.v1.archived',
    group: 'metadataField',
  },
  METADATA_FIELD_CREATED: {
    type: 'com.kaiten.metadata_field.v1.created',
    group: 'metadataField',
  },
  METADATA_FIELD_REORDERED: {
    type: 'com.kaiten.metadata_field.v1.reordered',
    group: 'metadataField',
  },
  METADATA_FIELD_UNARCHIVED: {
    type: 'com.kaiten.metadata_field.v1.unarchived',
    group: 'metadataField',
  },
  METADATA_FIELD_UPDATED: {
    type: 'com.kaiten.metadata_field.v1.updated',
    group: 'metadataField',
  },
  PUBLISHABLE_KEY_CREATED: {
    type: 'com.kaiten.publishable_key.v1.created',
    group: 'identity',
  },
  PUBLISHABLE_KEY_REVOKED: {
    type: 'com.kaiten.publishable_key.v1.revoked',
    group: 'identity',
  },
  RELEASE_CREATED: { type: 'com.kaiten.release.v1.created', group: 'release' },
  RELEASE_DELETED: { type: 'com.kaiten.release.v1.deleted', group: 'release' },
  RELEASE_DEPLOYED: {
    type: 'com.kaiten.deployment_zone.v1.release_deployed',
    group: 'release',
  },
  SYSTEM_ORGANIZATION_TOKEN_ISSUED: {
    type: 'com.kaiten.identity.v1.system_token_issued',
    group: 'identity',
  },
  // The billing events, listed in a file of their own.
  ...BILLING_WEBHOOK_EVENTS,
} as const satisfies WebhookEventEntries;
