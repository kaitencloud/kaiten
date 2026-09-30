import type { AuditEventCategory } from '@/domains/audit-trail';

/** The status of an event: the audit trail domain owns it (`getEventCategory`). */
export type EventCategory = AuditEventCategory;

export type ActivityTimelineMode = 'status' | 'group';

export type ValueOverTimeMode = 'entitlement' | 'group';

export type AuditEntitlementValue = {
  type: 'number' | 'boolean' | 'object';
  value: number | boolean | Record<string, unknown>;
  event_count?: number;
};

export type AuditPayload = {
  entitlement_id?: string;
  entitlement_slug?: string;
  instance_id?: string;
  license_id?: string;
  organization_id?: string;
  reported_value?: number;
  threshold?: number;
  timestamp?: string;
  type?: string;
  value?: number | boolean | AuditEntitlementValue;
};

export type AuditTrailEntitlementOption = {
  /** True when the counter is scoped to a reset window rather than to all time. */
  isPeriodic: boolean;
  label: string;
  slug: string;
  type: 'NUMBER' | 'BOOLEAN' | 'CONFIG';
};

export type AuditTrailEventOption = {
  label: string;
  value: string;
};

export type AuditTrailFilterState = {
  eventFilter: string;
  groupFilter: string;
  searchQuery: string;
  statusFilter: string;
};

export type ActivityTimelineDatum = {
  day: string;
  [key: string]: number | string;
};

export type ValueOverTimeDatum = {
  time: string;
  value: number;
};

export type ValueOverTimeGroupDatum = {
  /**
   * Sum across the group's lifetime counters only, and absent when the group
   * has none. Period-scoped counters are never folded in: their windows are
   * not guaranteed to be aligned with one another (HOUR next to MONTH, or a
   * CALENDAR anchor next to a LICENSE_START one), so the sum would have no
   * single window to belong to.
   */
  groupTotal?: number;
  time: string;
  [key: string]: number | string | undefined;
};
