import type { AuditEventName } from './audit-trail-events';
import type {
  AuditDayGroup,
  AuditEventCategory,
  AuditFilters,
  AuditTimeRange,
  AuditTrailOption,
  GlobalAuditEntry,
} from './audit-trail.types';

// Events whose status is decided by what they mean, not by how they end.
// Labels come from audit-trail-events.
//
// A `warning` tells a user that an entitlement's usage is approaching, at or
// past its limit, while the API still accepts the usage. Three events say so:
//
// - INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED: usage crossed the
//   entitlement's early-warning percentage, below the cap;
// - INSTANCE_ENTITLEMENT_USAGE_REACHED: usage equals the cap exactly, so the
//   next report is refused (hard limit) or starts an overage (soft limit);
// - INSTANCE_ENTITLEMENT_CAP_EXCEEDED: a soft limit took a report above the
//   cap and kept it, the overage included.
//
// A refusal is not a warning: ENTITLEMENT_USAGE_REPORT_REJECTED and
// CUSTOMER_CREATION_REJECTED read as rejected.
const KNOWN_CATEGORIES = {
  ENTITLEMENT_VALUE_GET: 'read',
  ENTITLEMENT_USAGE_REPORT_ACCEPTED: 'accepted',
  ENTITLEMENT_USAGE_REPORT_REJECTED: 'rejected',
  INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED: 'warning',
  INSTANCE_ENTITLEMENT_USAGE_REACHED: 'warning',
  INSTANCE_ENTITLEMENT_CAP_EXCEEDED: 'warning',
} as const satisfies Partial<Record<AuditEventName, AuditEventCategory>>;

// Any other event is coloured from its last word, so that failures read red and
// completions read green, and defaults to the neutral "read" tone. Among the
// events of the contract, only the `_CREATED`, `_DEPLOYED` and `_ASSIGNED` ones
// and `CUSTOMER_CREATION_REJECTED` reach a hint; the rest are there for an event
// newer than this build, which the API can emit before the console has its
// label (see humanizeEventName). There is no hint for `warning`: no event ends
// the way a warning would, and a guessed ending would be as likely to mislabel
// an event as to catch one. A warning is named in KNOWN_CATEGORIES.
const REJECTED_HINTS = [
  'rejected',
  'failed',
  'revoked',
  'suspended',
  'denied',
  'error',
];
const ACCEPTED_HINTS = [
  'accepted',
  'succeeded',
  'assigned',
  'created',
  'invited',
  'deployed',
];

// A hint matches the whole last word of the name, not its last letters:
// `LICENSE_ENTITLEMENT_UNASSIGNED` ends in `unassigned`, which is not
// `assigned`, so it reads like the other removals (`_DELETED`, `_ARCHIVED`).
const matchesHint = (eventName: string, hints: string[]): boolean =>
  hints.includes(eventName.toLowerCase().split(/[_.]/).pop() ?? '');

const isKnownEvent = (
  eventName: string,
): eventName is keyof typeof KNOWN_CATEGORIES =>
  Object.hasOwn(KNOWN_CATEGORIES, eventName);

export const getEventCategory = (eventName: string): AuditEventCategory => {
  if (isKnownEvent(eventName)) {
    return KNOWN_CATEGORIES[eventName];
  }
  if (matchesHint(eventName, REJECTED_HINTS)) {
    return 'rejected';
  }
  if (matchesHint(eventName, ACCEPTED_HINTS)) {
    return 'accepted';
  }
  return 'read';
};

export const formatRelativeTimeToNow = (
  timestamp: string,
  locale: string,
  now = new Date(),
): string => {
  const diffSeconds = Math.round(
    (new Date(timestamp).getTime() - now.getTime()) / 1000,
  );
  const relativeFormatter = new Intl.RelativeTimeFormat(locale, {
    numeric: 'auto',
  });
  const absoluteDiffSeconds = Math.abs(diffSeconds);

  if (absoluteDiffSeconds < 60) {
    return relativeFormatter.format(diffSeconds, 'second');
  }
  if (absoluteDiffSeconds < 3_600) {
    return relativeFormatter.format(Math.round(diffSeconds / 60), 'minute');
  }
  if (absoluteDiffSeconds < 86_400) {
    return relativeFormatter.format(Math.round(diffSeconds / 3_600), 'hour');
  }
  return relativeFormatter.format(Math.round(diffSeconds / 86_400), 'day');
};

export const isToday = (timestamp: string): boolean => {
  const date = new Date(timestamp);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};

const RANGE_MS: Record<Exclude<AuditTimeRange, 'all'>, number> = {
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
};

export const isWithinRange = (
  timestamp: string,
  range: AuditTimeRange,
  now: number = Date.now(),
): boolean => {
  if (range === 'all') {
    return true;
  }
  return now - new Date(timestamp).getTime() <= RANGE_MS[range];
};

export const buildEventOptions = (
  entries: GlobalAuditEntry[],
  getEventLabel: (eventName: string) => string,
): AuditTrailOption[] =>
  [...new Set(entries.map((entry) => entry.eventName))]
    .map((value) => ({ label: getEventLabel(value), value }))
    .sort((left, right) => left.label.localeCompare(right.label));

export const buildInstanceOptions = (
  entries: GlobalAuditEntry[],
): AuditTrailOption[] => {
  const labelBySlug = new Map<string, string>();
  for (const entry of entries) {
    if (entry.instanceSlug != null) {
      labelBySlug.set(
        entry.instanceSlug,
        entry.instanceName ?? entry.instanceSlug,
      );
    }
  }
  return [...labelBySlug.entries()]
    .map(([value, label]) => ({ label, value }))
    .sort((left, right) => left.label.localeCompare(right.label));
};

export const buildCustomerOptions = (
  entries: GlobalAuditEntry[],
): AuditTrailOption[] =>
  [
    ...new Set(
      entries
        .map((entry) => entry.customerName)
        .filter((name): name is string => name != null),
    ),
  ]
    .map((value) => ({ label: value, value }))
    .sort((left, right) => left.label.localeCompare(right.label));

export const DEFAULT_AUDIT_FILTERS: AuditFilters = {
  search: '',
  status: 'all',
  eventType: 'all',
  instance: 'all',
  customer: 'all',
  range: 'all',
};

export const hasActiveAuditFilters = (filters: AuditFilters): boolean =>
  filters.search.length > 0 ||
  filters.status !== 'all' ||
  filters.eventType !== 'all' ||
  filters.instance !== 'all' ||
  filters.customer !== 'all' ||
  filters.range !== 'all';

export const filterAuditEntries = (
  entries: GlobalAuditEntry[],
  filters: AuditFilters,
  getEventLabel: (eventName: string) => string,
): GlobalAuditEntry[] =>
  entries.filter((entry) => {
    if (!isWithinRange(entry.timestamp, filters.range)) {
      return false;
    }
    if (
      filters.status !== 'all' &&
      getEventCategory(entry.eventName) !== filters.status
    ) {
      return false;
    }
    if (filters.eventType !== 'all' && entry.eventName !== filters.eventType) {
      return false;
    }
    if (filters.instance !== 'all' && entry.instanceSlug !== filters.instance) {
      return false;
    }
    if (filters.customer !== 'all' && entry.customerName !== filters.customer) {
      return false;
    }
    if (!filters.search) {
      return true;
    }

    const normalizedQuery = filters.search.toLowerCase();
    const haystack = [
      entry.eventName,
      getEventLabel(entry.eventName),
      entry.instanceName,
      entry.instanceSlug,
      entry.customerName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });

export const formatTimeOfDay = (timestamp: string, locale: string): string =>
  new Date(timestamp).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

// Stable per-calendar-day key used to bucket entries into day groups.
export const getDayKey = (timestamp: string): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

export interface DayHeadingLabels {
  today: string;
  yesterday: string;
}

// Day-section heading: "Today" / "Yesterday" for the two most recent days,
// otherwise a localized weekday + date (e.g. "Thu, Jun 12").
export const formatDayHeading = (
  timestamp: string,
  locale: string,
  labels: DayHeadingLabels,
  now: Date = new Date(),
): string => {
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(new Date(timestamp))) / 86_400_000,
  );

  if (diffDays === 0) {
    return labels.today;
  }
  if (diffDays === 1) {
    return labels.yesterday;
  }
  return new Date(timestamp).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

export interface DayGroup<T> {
  key: string;
  heading: string;
  entries: T[];
}

// Buckets pre-sorted (newest-first) items into consecutive day groups,
// preserving order so a feed reads reverse-chronologically. Generic because
// the notifications feed groups its own item type the same way.
export const groupItemsByDay = <T>(
  items: T[],
  getTimestamp: (item: T) => string,
  makeHeading: (timestamp: string) => string,
): DayGroup<T>[] => {
  const groups: DayGroup<T>[] = [];
  const groupsByKey = new Map<string, DayGroup<T>>();

  for (const item of items) {
    const timestamp = getTimestamp(item);
    const key = getDayKey(timestamp);
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.entries.push(item);
      continue;
    }
    const group: DayGroup<T> = {
      key,
      heading: makeHeading(timestamp),
      entries: [item],
    };
    groupsByKey.set(key, group);
    groups.push(group);
  }

  return groups;
};

export const groupEntriesByDay = (
  entries: GlobalAuditEntry[],
  makeHeading: (timestamp: string) => string,
): AuditDayGroup[] =>
  groupItemsByDay(entries, (entry) => entry.timestamp, makeHeading);
