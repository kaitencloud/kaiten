import type { AuditTrail } from '@/api-client/types.gen';
import type { InstanceEntitlementRow } from '../../../../utils/instance-detail-entitlements.utils';
import type {
  ValueOverTimeDatum,
  ValueOverTimeGroupDatum,
} from './audit-trail.types';
import {
  buildValueOverTimeGroupEntitlementOptions,
  formatDayLabel,
  getPayload,
  getPayloadScalarValue,
} from './audit-trail-entry.utils';

export const buildValueOverTimeData = ({
  entries,
  entitlementSlug,
  locale,
  numberEntitlementSlugs,
}: {
  entries: AuditTrail[];
  entitlementSlug: string;
  locale: string;
  numberEntitlementSlugs: Set<string>;
}): ValueOverTimeDatum[] => {
  if (!numberEntitlementSlugs.has(entitlementSlug)) {
    return [];
  }

  const filtered = entries.filter((entry) => {
    const payload = getPayload(entry);

    return (
      payload.entitlement_slug === entitlementSlug &&
      numberEntitlementSlugs.has(payload.entitlement_slug ?? '') &&
      typeof getPayloadScalarValue(payload) === 'number'
    );
  });

  const latestByDay = new Map<string, { timestamp: string; value: number }>();

  for (const entry of filtered) {
    const dayKey = entry.timestamp.slice(0, 10);
    const value = getPayloadScalarValue(getPayload(entry)) as number;
    const previous = latestByDay.get(dayKey);

    if (
      !previous ||
      new Date(entry.timestamp).getTime() >
        new Date(previous.timestamp).getTime()
    ) {
      latestByDay.set(dayKey, { timestamp: entry.timestamp, value });
    }
  }

  return [...latestByDay.entries()]
    .sort(([leftDay], [rightDay]) => leftDay.localeCompare(rightDay))
    .map(([dayKey, { value }]) => ({
      time: formatDayLabel(dayKey, locale),
      value,
    }));
};

export const buildValueOverTimeGroupData = ({
  entries,
  entitlementsRows,
  groupSlug,
  locale,
  visibleEntitlementSlugs,
}: {
  entries: AuditTrail[];
  entitlementsRows: InstanceEntitlementRow[];
  groupSlug: string;
  locale: string;
  visibleEntitlementSlugs: string[];
}): ValueOverTimeGroupDatum[] => {
  const groupEntitlementOptions = buildValueOverTimeGroupEntitlementOptions(
    entitlementsRows,
    groupSlug,
  );

  if (groupEntitlementOptions.length === 0) {
    return [];
  }

  const groupEntitlementSlugSet = new Set(
    groupEntitlementOptions.map((entitlement) => entitlement.slug),
  );
  const visibleEntitlementSlugSet = new Set(
    visibleEntitlementSlugs.filter((slug) => groupEntitlementSlugSet.has(slug)),
  );
  const latestByEntitlementByDay = new Map<
    string,
    Map<string, { timestamp: string; value: number }>
  >();
  const dayKeys = new Set<string>();

  for (const entry of entries) {
    const payload = getPayload(entry);
    const entitlementSlug = payload.entitlement_slug;

    const scalarValue = getPayloadScalarValue(payload);

    if (
      !entitlementSlug ||
      !groupEntitlementSlugSet.has(entitlementSlug) ||
      typeof scalarValue !== 'number'
    ) {
      continue;
    }

    const dayKey = entry.timestamp.slice(0, 10);
    const latestByDay =
      latestByEntitlementByDay.get(entitlementSlug) ?? new Map();
    const previous = latestByDay.get(dayKey);

    if (
      !previous ||
      new Date(entry.timestamp).getTime() >
        new Date(previous.timestamp).getTime()
    ) {
      latestByDay.set(dayKey, {
        timestamp: entry.timestamp,
        value: scalarValue,
      });
      latestByEntitlementByDay.set(entitlementSlug, latestByDay);
      dayKeys.add(dayKey);
    }
  }

  // Forward-filling is only true of a lifetime counter: on a day with no
  // report it really does still hold its last reported value. A period-scoped
  // counter returns to zero at a boundary the audit payload does not record --
  // entries carry no window bounds -- so carrying it would paint the pre-reset
  // peak flat across the reset. Those days get no point instead, and the gap
  // says exactly what we know: nothing was observed.
  const carriedValues = new Map<string, number>();
  const hasLifetimeEntitlement = groupEntitlementOptions.some(
    (entitlement) => !entitlement.isPeriodic,
  );

  return [...dayKeys]
    .sort((leftDay, rightDay) => leftDay.localeCompare(rightDay))
    .map((dayKey) => {
      const point: ValueOverTimeGroupDatum = {
        time: formatDayLabel(dayKey, locale),
      };
      let groupTotal = 0;

      for (const entitlement of groupEntitlementOptions) {
        const latestValue = latestByEntitlementByDay
          .get(entitlement.slug)
          ?.get(dayKey);
        const isVisible = visibleEntitlementSlugSet.has(entitlement.slug);

        if (entitlement.isPeriodic) {
          if (latestValue && isVisible) {
            point[entitlement.slug] = latestValue.value;
          }

          continue;
        }

        if (latestValue) {
          carriedValues.set(entitlement.slug, latestValue.value);
        }

        const value = carriedValues.get(entitlement.slug) ?? 0;
        groupTotal += value;

        if (isVisible) {
          point[entitlement.slug] = value;
        }
      }

      if (hasLifetimeEntitlement) {
        point.groupTotal = groupTotal;
      }

      return point;
    });
};
