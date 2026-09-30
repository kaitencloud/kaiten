import type { useTranslation } from 'react-i18next';
import type { ChartConfig } from '@/components/ui/chart';
import type { AuditTrailEntitlementOption } from './audit-trail.utils';

/** Light nudge for value chart Y ticks (wide formatted numbers); avoid large negative dx + negative margin or ticks clip. */
export const VALUE_Y_AXIS_TICK = { dx: -4 } as const;

/** Match dashboard column charts (`VERTICAL_BAR_TOP_RADIUS`). */
const VERTICAL_BAR_TOP_RADIUS: [number, number, number, number] = [6, 6, 0, 0];

export function activityTimelineStackTopRadius(
  segment: string,
  seriesKeys: string[],
  payload: Record<string, unknown> | undefined,
): [number, number, number, number] | number {
  for (let index = seriesKeys.length - 1; index >= 0; index -= 1) {
    const seriesKey = seriesKeys[index];
    const value =
      typeof payload?.[seriesKey] === 'number'
        ? (payload[seriesKey] as number)
        : 0;

    if (value > 0) {
      return segment === seriesKey ? VERTICAL_BAR_TOP_RADIUS : [0, 0, 0, 0];
    }
  }

  return [0, 0, 0, 0];
}

function buildActivityChartConfig(
  t: ReturnType<typeof useTranslation>['t'],
): ChartConfig {
  return {
    accepted: {
      color: 'var(--success)',
      label: t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.series.accepted',
      ),
    },
    read: {
      color: 'var(--primary)',
      label: t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.series.read',
      ),
    },
    rejected: {
      color: 'var(--destructive)',
      label: t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.series.rejected',
      ),
    },
    warning: {
      color: 'var(--warning)',
      label: t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.series.warning',
      ),
    },
  };
}

export function buildValueChartConfig(
  t: ReturnType<typeof useTranslation>['t'],
): ChartConfig {
  return {
    value: {
      color: 'var(--primary)',
      label: t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.valueLabel',
      ),
    },
  };
}

export function buildValueOverTimeGroupChartConfig({
  entitlements,
  groupTotalLabel,
  periodicSuffix,
}: {
  entitlements: AuditTrailEntitlementOption[];
  groupTotalLabel: string;
  /** Marks a series whose counter clears on reset, so its drops read as resets. */
  periodicSuffix?: string;
}): ChartConfig {
  const colorsBySlug = new Map(
    [...entitlements]
      .sort((left, right) => left.slug.localeCompare(right.slug))
      .map((entitlement, index) => [
        entitlement.slug,
        `var(--chart-${(index % 5) + 1})`,
      ]),
  );

  return {
    groupTotal: {
      color: 'var(--primary)',
      label: groupTotalLabel,
    },
    ...Object.fromEntries(
      entitlements.map((entitlement) => [
        entitlement.slug,
        {
          color: colorsBySlug.get(entitlement.slug) ?? 'var(--chart-1)',
          label:
            entitlement.isPeriodic && periodicSuffix
              ? `${entitlement.label} (${periodicSuffix})`
              : entitlement.label,
        },
      ]),
    ),
  };
}

export function buildActivityTimelineStatusChartConfig(
  t: ReturnType<typeof useTranslation>['t'],
): ChartConfig {
  return buildActivityChartConfig(t);
}

export function buildActivityTimelineGroupChartConfig(
  groupOptions: Array<{ label: string; value: string }>,
): ChartConfig {
  return Object.fromEntries(
    groupOptions.map((group, index) => [
      group.value,
      {
        color: `var(--chart-${(index % 5) + 1})`,
        label: group.label,
      },
    ]),
  );
}
