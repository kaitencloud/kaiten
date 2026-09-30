import type { AuditTrail } from '@/api-client/types.gen';
import { getEventCategory } from '@/domains/audit-trail';
import type { InstanceEntitlementRow } from '../../../../utils/instance-detail-entitlements.utils';
import type { ActivityTimelineDatum, EventCategory } from './audit-trail.types';
import {
  doesAuditEntryMatchGroup,
  formatDayLabel,
  getAuditEntryGroups,
  getPayload,
} from './audit-trail-entry.utils';

export const buildActivityTimelineStatusData = ({
  entries,
  entitlementsRows,
  groupFilter,
  entitlementFilter,
  locale,
}: {
  entries: AuditTrail[];
  entitlementsRows: InstanceEntitlementRow[];
  groupFilter: string;
  entitlementFilter: string;
  locale: string;
}) => {
  const filteredEntries = entries.filter((entry) => {
    if (
      groupFilter !== 'all' &&
      !doesAuditEntryMatchGroup(entry, groupFilter, entitlementsRows)
    ) {
      return false;
    }

    if (entitlementFilter === 'all') {
      return true;
    }

    return getPayload(entry).entitlement_slug === entitlementFilter;
  });
  const buckets = new Map<string, ActivityTimelineDatum>();

  for (const entry of filteredEntries) {
    const dayKey = entry.timestamp.slice(0, 10);

    if (!buckets.has(dayKey)) {
      buckets.set(dayKey, {
        day: formatDayLabel(dayKey, locale),
        accepted: 0,
        read: 0,
        rejected: 0,
        warning: 0,
      });
    }

    const bucket = buckets.get(dayKey);

    if (bucket) {
      const eventCategory = getEventCategory(entry.eventName);
      const currentCount =
        typeof bucket[eventCategory] === 'number' ? bucket[eventCategory] : 0;

      bucket[eventCategory] = currentCount + 1;
    }
  }

  return [...buckets.entries()]
    .sort(([leftDay], [rightDay]) => leftDay.localeCompare(rightDay))
    .map(([, value]) => value);
};

export const buildActivityTimelineGroupData = ({
  entries,
  entitlementsRows,
  includedGroupSlugs,
  includedStatuses,
  locale,
}: {
  entries: AuditTrail[];
  entitlementsRows: InstanceEntitlementRow[];
  includedGroupSlugs: string[];
  includedStatuses: EventCategory[];
  locale: string;
}) => {
  const includedGroupSlugSet = new Set(includedGroupSlugs);
  const includedStatusSet = new Set(includedStatuses);
  const buckets = new Map<string, ActivityTimelineDatum>();

  for (const entry of entries) {
    const category = getEventCategory(entry.eventName);
    if (!includedStatusSet.has(category)) {
      continue;
    }

    const matchingGroups = getAuditEntryGroups(entry, entitlementsRows).filter(
      (group) => includedGroupSlugSet.has(group.slug),
    );

    if (matchingGroups.length === 0) {
      continue;
    }

    const dayKey = entry.timestamp.slice(0, 10);

    if (!buckets.has(dayKey)) {
      buckets.set(dayKey, {
        day: formatDayLabel(dayKey, locale),
      });
    }

    const bucket = buckets.get(dayKey);

    if (!bucket) {
      continue;
    }

    for (const group of matchingGroups) {
      const currentCount =
        typeof bucket[group.slug] === 'number'
          ? (bucket[group.slug] as number)
          : 0;

      bucket[group.slug] = currentCount + 1;
    }
  }

  return [...buckets.entries()]
    .sort(([leftDay], [rightDay]) => leftDay.localeCompare(rightDay))
    .map(([, value]) => value);
};
