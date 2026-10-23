// Event "category" drives the status badge, the row icon, the stat cards, the
// status filter and the CSV export, all through `getEventCategory`. The global
// feed and an instance's audit tab both read it from there, so an event has one
// status on every screen. `warning` is for the usage events that say a limit is
// approaching, at or past, while the API still accepts the usage.
export type AuditEventCategory = 'read' | 'accepted' | 'rejected' | 'warning';

// Quick time-range filter applied to the feed.
export type AuditTimeRange = '24h' | '7d' | '30d' | 'all';

// Who an entry is recorded under: a person, a service account, or Kaiten
// itself (`SYSTEM`), which records the jobs and the anonymous checkouts.
export interface AuditEntryActor {
  id: string;
  name: string;
  kind: string;
}

// A single global audit entry, straight from `organizationAuditTrails`. The
// instance/customer fields are only present for instance-scoped events —
// organization-level events (e.g. customer created) carry none. `actor` is
// absent for an entry recorded before the API kept actors, or whose user is
// gone.
export interface GlobalAuditEntry {
  id: string;
  eventName: string;
  eventType: string;
  instanceId?: string;
  instanceSlug?: string;
  instanceName?: string;
  customerName?: string;
  payload?: unknown;
  timestamp: string;
  actor?: AuditEntryActor;
}

export interface AuditTrailOption {
  label: string;
  value: string;
}

// State for the feature's custom filter toolbar. `'all'` means "no filter" for
// the single-select dimensions.
export interface AuditFilters {
  search: string;
  status: string;
  eventType: string;
  instance: string;
  customer: string;
  range: AuditTimeRange;
}

// A day's worth of entries in the feed, used for the date-grouped display where
// each day gets its own heading (Today / Yesterday / a date).
export interface AuditDayGroup {
  key: string;
  heading: string;
  entries: GlobalAuditEntry[];
}
