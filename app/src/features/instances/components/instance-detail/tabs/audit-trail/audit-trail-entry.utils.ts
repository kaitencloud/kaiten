import type { AuditTrail } from '@/api-client/types.gen';
import { getEventCategory } from '@/domains/audit-trail';
import { isPeriodicEntitlement } from '@/domains/entitlement-usage';
import {
  type InstanceEntitlementRow,
  isEntitlementInGroup,
} from '../../../../utils/instance-detail-entitlements.utils';
import type {
  AuditEntitlementValue,
  AuditPayload,
  AuditTrailEntitlementOption,
  AuditTrailEventOption,
  AuditTrailFilterState,
} from './audit-trail.types';

// Labels and statuses come from the shared audit trail domain
// (`resolveEventLabel` and `getEventCategory` in @/domains/audit-trail), so an
// event reads the same here and in the global feed.

export const getPayload = (entry: AuditTrail): AuditPayload => {
  if (entry.payload && typeof entry.payload === 'object') {
    return entry.payload as AuditPayload;
  }

  return {};
};

export const getPayloadScalarValue = (
  payload: AuditPayload,
): number | boolean | undefined => {
  const { value } = payload;
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object' && 'type' in value) {
    const nested = value as AuditEntitlementValue;
    if (nested.type === 'number' || nested.type === 'boolean') {
      return nested.value as number | boolean;
    }
  }
  return undefined;
};

const dayLabelFormatters = new Map<string, Intl.DateTimeFormat>();

const getDayLabelFormatter = (locale: string) => {
  let formatter = dayLabelFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
    });
    dayLabelFormatters.set(locale, formatter);
  }
  return formatter;
};

export const formatDayLabel = (iso: string, locale: string) => {
  const [year, month, day] = iso.split('-').map(Number);

  return getDayLabelFormatter(locale).format(
    new Date(Date.UTC(year, month - 1, day, 12)),
  );
};

const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>();

const getRelativeTimeFormatter = (locale: string) => {
  let formatter = relativeTimeFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, {
      numeric: 'auto',
    });
    relativeTimeFormatters.set(locale, formatter);
  }
  return formatter;
};

export const formatRelativeTimeToNow = (
  timestamp: string,
  locale: string,
  now = new Date(),
) => {
  const diffSeconds = Math.round(
    (new Date(timestamp).getTime() - now.getTime()) / 1000,
  );
  const relativeFormatter = getRelativeTimeFormatter(locale);
  const absoluteDiffSeconds = Math.abs(diffSeconds);

  if (absoluteDiffSeconds < 60) {
    return relativeFormatter.format(diffSeconds, 'second');
  }

  const diffMinutes = Math.round(diffSeconds / 60);

  if (absoluteDiffSeconds < 3_600) {
    return relativeFormatter.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffSeconds / 3_600);

  if (absoluteDiffSeconds < 86_400) {
    return relativeFormatter.format(diffHours, 'hour');
  }

  const diffDays = Math.round(diffSeconds / 86_400);

  return relativeFormatter.format(diffDays, 'day');
};

export const isToday = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};

export const getEntitlementLabelForAuditSlug = (
  slug: string | undefined,
  rows: InstanceEntitlementRow[],
): string | undefined => {
  if (!slug) {
    return undefined;
  }

  const row = rows.find((item) => item.entitlementSlug === slug);

  return row?.entitlementName ?? slug;
};

export const buildAuditTrailEntitlementOptions = (
  entitlementsRows: InstanceEntitlementRow[],
) => {
  const optionsBySlug = new Map<string, AuditTrailEntitlementOption>();

  for (const entitlement of entitlementsRows) {
    if (!entitlement.entitlementSlug) {
      continue;
    }

    optionsBySlug.set(entitlement.entitlementSlug, {
      isPeriodic: isPeriodicEntitlement(entitlement),
      label: entitlement.entitlementName,
      slug: entitlement.entitlementSlug,
      type: entitlement.entitlementType,
    });
  }

  return [...optionsBySlug.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
};

export const buildValueOverTimeNumericEntitlementOptions = (
  entitlementsRows: InstanceEntitlementRow[],
) =>
  buildAuditTrailEntitlementOptions(entitlementsRows).filter(
    (entitlement) => entitlement.type === 'NUMBER',
  );

export const buildValueOverTimeNumericGroupOptions = (
  entitlementsRows: InstanceEntitlementRow[],
) => {
  const optionsBySlug = new Map<string, { label: string; value: string }>();

  for (const entitlement of entitlementsRows) {
    if (
      entitlement.entitlementType !== 'NUMBER' ||
      !entitlement.entitlementSlug
    ) {
      continue;
    }

    for (const group of entitlement.entitlementGroups) {
      optionsBySlug.set(group.slug, {
        label: group.name,
        value: group.slug,
      });
    }
  }

  return [...optionsBySlug.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
};

export const buildValueOverTimeGroupEntitlementOptions = (
  entitlementsRows: InstanceEntitlementRow[],
  groupSlug: string,
) => {
  if (!groupSlug) {
    return [];
  }

  return buildValueOverTimeNumericEntitlementOptions(
    entitlementsRows.filter((entitlement) =>
      isEntitlementInGroup(entitlement, groupSlug),
    ),
  );
};

const getEntitlementRowByAuditSlug = (
  slug: string | undefined,
  entitlementsRows: InstanceEntitlementRow[],
) => {
  if (!slug) {
    return undefined;
  }

  return entitlementsRows.find((row) => row.entitlementSlug === slug);
};

export const getAuditEntryGroups = (
  entry: AuditTrail,
  entitlementsRows: InstanceEntitlementRow[],
) =>
  getEntitlementRowByAuditSlug(
    getPayload(entry).entitlement_slug,
    entitlementsRows,
  )?.entitlementGroups ?? [];

export const buildAuditTrailEventOptions = (
  entries: AuditTrail[],
  getLabel: (eventName: string) => string,
) => {
  const uniqueEventNames = new Set(entries.map((entry) => entry.eventName));
  const options: AuditTrailEventOption[] = [];

  for (const eventName of uniqueEventNames) {
    options.push({
      label: getLabel(eventName),
      value: eventName,
    });
  }

  return options.sort((left, right) => left.label.localeCompare(right.label));
};

export const doesAuditEntryMatchGroup = (
  entry: AuditTrail,
  groupSlug: string,
  entitlementsRows: InstanceEntitlementRow[],
) => {
  if (groupSlug === 'all') {
    return true;
  }

  const entitlement = getEntitlementRowByAuditSlug(
    getPayload(entry).entitlement_slug,
    entitlementsRows,
  );

  return entitlement ? isEntitlementInGroup(entitlement, groupSlug) : false;
};

export const filterAuditTrailEntries = (
  entries: AuditTrail[],
  filters: AuditTrailFilterState,
  getEventLabel: (eventName: string) => string,
  entitlementsRows: InstanceEntitlementRow[],
) =>
  entries.filter((entry) => {
    if (
      filters.groupFilter !== 'all' &&
      !doesAuditEntryMatchGroup(entry, filters.groupFilter, entitlementsRows)
    ) {
      return false;
    }

    if (
      filters.eventFilter !== 'all' &&
      entry.eventName !== filters.eventFilter
    ) {
      return false;
    }

    if (
      filters.statusFilter !== 'all' &&
      getEventCategory(entry.eventName) !== filters.statusFilter
    ) {
      return false;
    }

    if (!filters.searchQuery) {
      return true;
    }

    const payload = getPayload(entry);
    const normalizedQuery = filters.searchQuery.toLowerCase();
    const entitlementLabel = payload.entitlement_slug
      ? getEntitlementLabelForAuditSlug(
          payload.entitlement_slug,
          entitlementsRows,
        )
      : undefined;
    const searchValues = [
      entry.eventName,
      getEventCategory(entry.eventName),
      payload.entitlement_slug,
      entitlementLabel,
      getEventLabel(entry.eventName),
    ];

    return searchValues.some((value) =>
      value?.toLowerCase().includes(normalizedQuery),
    );
  });

export const hasActiveAuditTrailFilters = ({
  eventFilter,
  groupFilter,
  searchQuery,
  statusFilter,
}: AuditTrailFilterState) =>
  eventFilter !== 'all' ||
  groupFilter !== 'all' ||
  statusFilter !== 'all' ||
  searchQuery.length > 0;
