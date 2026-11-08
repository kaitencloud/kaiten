import type {
  DashboardInstanceReports,
  DashboardMeter,
  DashboardSummary,
} from '@/api-client';

/**
 * The one health word of an instance, from the summary: at a limit when a meter
 * refuses, watch when one is above its warning threshold, silent when nothing
 * reported or read over the period, healthy otherwise. The order is the order
 * of attention.
 */
export type Standing = 'atLimit' | 'watch' | 'silent' | 'healthy';

export const STANDING_ORDER: Standing[] = [
  'atLimit',
  'watch',
  'silent',
  'healthy',
];

export type FleetRow = {
  instanceSlug: string;
  instanceName: string;
  customerSlug: string;
  customerName: string;
  standing: Standing;
  /** The meter that decides the standing, when one does: the worst one. */
  headline: DashboardMeter | null;
  reports: DashboardInstanceReports;
};

const ratioOf = (meter: DashboardMeter): number =>
  meter.ratio ?? (meter.granted ? meter.used / meter.granted : 0);

/** The worst meter of each instance, by ratio, among the ones the summary ranks. */
export function worstMeterByInstance(
  meters: DashboardMeter[],
): Map<string, DashboardMeter> {
  const worst = new Map<string, DashboardMeter>();
  for (const meter of meters) {
    const current = worst.get(meter.instanceSlug);
    if (!current || ratioOf(meter) > ratioOf(current)) {
      worst.set(meter.instanceSlug, meter);
    }
  }
  return worst;
}

export function standingOf(
  reports: DashboardInstanceReports,
  headline: DashboardMeter | null,
): Standing {
  if (headline?.limitReached) {
    return 'atLimit';
  }
  if (headline?.aboveWarning) {
    return 'watch';
  }
  if (reports.silent) {
    return 'silent';
  }
  return 'healthy';
}

/**
 * Every instance of the organization with its standing, the ones that need
 * attention first. The meters the summary ranks are the eight closest to their
 * limits, so an instance beyond them stands on its activity alone.
 */
export function buildFleet(summary: DashboardSummary): FleetRow[] {
  const meters = worstMeterByInstance([
    ...summary.saturation,
    ...summary.attention.hardLimits.items,
    ...summary.attention.nearThreshold.items,
  ]);
  const rows = summary.usageReports.byInstance.map((reports) => {
    const headline = meters.get(reports.instanceSlug) ?? null;
    return {
      instanceSlug: reports.instanceSlug,
      instanceName: reports.instanceName,
      customerSlug: reports.customerSlug,
      customerName: reports.customerName,
      standing: standingOf(reports, headline),
      headline,
      reports,
    } satisfies FleetRow;
  });
  return rows.sort(
    (a, b) =>
      STANDING_ORDER.indexOf(a.standing) - STANDING_ORDER.indexOf(b.standing) ||
      a.customerName.localeCompare(b.customerName) ||
      a.instanceName.localeCompare(b.instanceName),
  );
}

/** How many instances stand in each state. */
export function countStandings(rows: FleetRow[]): Record<Standing, number> {
  const counts: Record<Standing, number> = {
    atLimit: 0,
    watch: 0,
    silent: 0,
    healthy: 0,
  };
  for (const row of rows) {
    counts[row.standing] += 1;
  }
  return counts;
}
