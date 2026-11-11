import type {
  DashboardInstanceReports,
  DashboardMeter,
  DashboardSummary,
} from '@/api-client';

/**
 * The one health word of an instance, as the API computes it over every meter
 * of the organization: at a limit when a meter refuses, watch when one is above
 * its warning threshold, silent when nothing was reported or read in the windows
 * the usage history and the audit trail cover,
 * healthy otherwise. The order is the order of attention.
 */
export type Standing = DashboardInstanceReports['standing'];

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

/**
 * Every instance of the organization with its standing, the ones that need
 * attention first. The standing and the meter behind it come with each row:
 * the API ranks every meter of the instance, so a meter that refuses reports
 * is never hidden by one further along an allowance nothing refuses, and an
 * instance beyond the eight meters the saturation list shows keeps its own.
 */
export function buildFleet(summary: DashboardSummary): FleetRow[] {
  const rows = summary.usageReports.byInstance.map(
    (reports) =>
      ({
        instanceSlug: reports.instanceSlug,
        instanceName: reports.instanceName,
        customerSlug: reports.customerSlug,
        customerName: reports.customerName,
        standing: reports.standing,
        headline: reports.headline ?? null,
        reports,
      }) satisfies FleetRow,
  );
  return rows.sort(
    (a, b) =>
      STANDING_ORDER.indexOf(a.standing) - STANDING_ORDER.indexOf(b.standing) ||
      a.customerName.localeCompare(b.customerName) ||
      a.instanceName.localeCompare(b.instanceName),
  );
}

/**
 * How many instances stand in each state, over the whole organization: the
 * API's count, not the rows the page holds.
 */
export function countStandings(
  summary: DashboardSummary,
): Record<Standing, number> {
  const { byStanding } = summary.figures.instances;
  return {
    atLimit: byStanding.atLimit,
    watch: byStanding.watch,
    silent: byStanding.silent,
    healthy: byStanding.healthy,
  };
}
