import type {
  AuditTrail,
  EntitlementUsage,
  LicenseEntitlement,
} from '@/api-client';
import {
  storyEntitlements,
  storyLastWeek,
  storyLicenses,
  storyUser,
  storyYesterday,
} from './storybook-core-fixtures';
import { storyInstances } from './storybook-instance-fixtures';

export const storyLicenseEntitlements = [
  {
    createdAt: storyLastWeek,
    createdBy: storyUser,
    entitlementGroups: storyEntitlements[0].entitlementGroups,
    entitlementName: storyEntitlements[0].name,
    entitlementSlug: storyEntitlements[0].slug,
    entitlementType: 'NUMBER',
    licenseId: storyLicenses[0].id,
    licenseSlug: storyLicenses[0].slug,
    // A soft limit: the API accepts usage up to 1,200,000 before rejecting it,
    // so the usage bar and the exhausted flag both measure against that, not
    // against the granted 1,000,000.
    limitCapExceededOveragePercent: 20,
    updatedAt: storyYesterday,
    updatedBy: storyUser,
    value: {
      type: 'number',
      value: 1_000_000,
    },
  },
  {
    createdAt: storyLastWeek,
    createdBy: storyUser,
    entitlementGroups: storyEntitlements[1].entitlementGroups,
    entitlementName: storyEntitlements[1].name,
    entitlementSlug: storyEntitlements[1].slug,
    entitlementType: 'BOOLEAN',
    licenseId: storyLicenses[0].id,
    licenseSlug: storyLicenses[0].slug,
    updatedAt: storyYesterday,
    updatedBy: storyUser,
    value: {
      type: 'boolean',
      value: true,
    },
  },
] satisfies LicenseEntitlement[];

export const storyEntitlementUsages = [
  {
    entitlementId: storyEntitlements[0].id,
    entitlementSlug: storyEntitlements[0].slug,
    licenseId: storyLicenses[0].id,
    licenseSlug: storyLicenses[0].slug,
    source: 'license',
    // storyEntitlements[0] resets monthly on the calendar, and the API always
    // reports the window alongside the value it was counted in.
    currentPeriodStart: '2026-03-01T00:00:00.000Z',
    currentPeriodEnd: '2026-04-01T00:00:00.000Z',
    value: {
      event_count: 42_000,
      type: 'number',
      value: 420_000,
    },
  },
  {
    entitlementId: storyEntitlements[1].id,
    entitlementSlug: storyEntitlements[1].slug,
    licenseId: storyLicenses[0].id,
    licenseSlug: storyLicenses[0].slug,
    source: 'license',
    value: {
      type: 'boolean',
      value: true,
    },
  },
] satisfies EntitlementUsage[];

export const storyAuditEntries = [
  {
    eventName: 'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_accepted',
    id: '101',
    instanceId: storyInstances[0].id,
    instanceSlug: storyInstances[0].slug,
    payload: {
      entitlement_slug: storyEntitlements[0].slug,
      type: 'NUMBER',
      value: 380_000,
    },
    timestamp: '2026-04-21T08:00:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_VALUE_GET',
    eventType: 'com.kaiten.instance.entitlement.v1.value_get',
    id: '102',
    instanceId: storyInstances[0].id,
    instanceSlug: storyInstances[0].slug,
    payload: {
      entitlement_slug: storyEntitlements[0].slug,
      type: 'NUMBER',
      value: 410_000,
    },
    timestamp: '2026-04-22T08:00:00.000Z',
  },
  {
    eventName: 'ENTITLEMENT_USAGE_REPORT_REJECTED',
    eventType: 'com.kaiten.instance.entitlement.v1.usage_report_rejected',
    id: '103',
    instanceId: storyInstances[0].id,
    instanceSlug: storyInstances[0].slug,
    payload: {
      entitlement_slug: storyEntitlements[0].slug,
      type: 'NUMBER',
      value: 1_120_000,
    },
    timestamp: storyYesterday,
  },
  // The early warning of the soft limit above: 90% of the granted 1,000,000.
  {
    eventName: 'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
    eventType:
      'com.kaiten.instance.entitlement.v1.usage_warning_threshold_reached',
    id: '104',
    instanceId: storyInstances[0].id,
    instanceSlug: storyInstances[0].slug,
    payload: {
      boundary: 900_000,
      entitlement_slug: storyEntitlements[0].slug,
      threshold: 1_000_000,
      value: 910_000,
    },
    timestamp: '2026-04-22T12:00:00.000Z',
  },
] satisfies AuditTrail[];
