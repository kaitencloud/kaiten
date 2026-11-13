import { z } from 'zod';

export const DASHBOARD_RANGES = ['7d', '30d', '90d'] as const;
export const DASHBOARD_VIEWS = ['customers', 'integration'] as const;

export const DEFAULT_DASHBOARD_RANGE = '30d' satisfies DashboardRange;
export const DEFAULT_DASHBOARD_VIEW = 'customers' satisfies DashboardView;

/**
 * What a link can open the dashboard on: the period its rates and lists cover
 * (`?range=7d|30d|90d`) and the view (`?view=customers|integration`). A value
 * that reads as neither falls back to the default rather than failing the
 * page; the route strips the defaults from the address, so `/dashboard` stays
 * `/dashboard`.
 */
export const dashboardSearchSchema = z.object({
  // `.default()` lets a link leave the key out; `.catch()` forgives a value
  // that reads as none of them. Both read as the default on the page.
  range: z
    .enum(DASHBOARD_RANGES)
    .default(DEFAULT_DASHBOARD_RANGE)
    .catch(DEFAULT_DASHBOARD_RANGE),
  view: z
    .enum(DASHBOARD_VIEWS)
    .default(DEFAULT_DASHBOARD_VIEW)
    .catch(DEFAULT_DASHBOARD_VIEW),
});

export type DashboardSearch = z.output<typeof dashboardSearchSchema>;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export function readDashboardSearch(search: unknown): DashboardSearch {
  return dashboardSearchSchema.parse(search);
}

/**
 * The search a link carries to open the dashboard on a period and a view: the
 * values that are the defaults are left out, so `/dashboard` stays `/dashboard`.
 */
export function toDashboardSearch({
  range,
  view,
}: DashboardSearch): Record<string, string> {
  const search: Record<string, string> = {};
  if (range !== DEFAULT_DASHBOARD_RANGE) {
    search.range = range;
  }
  if (view !== DEFAULT_DASHBOARD_VIEW) {
    search.view = view;
  }
  return search;
}
