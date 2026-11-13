import { queryOptions } from '@tanstack/react-query';
import { getDashboardSummaryOptions } from '@/api-client/@tanstack/react-query.gen';
import type { DashboardRange } from '../search';

/**
 * `GET /dashboard/summary`: the console's home in one response, computed in the
 * database over the whole organization for one period. It keeps the generated key,
 * so that an action elsewhere refreshes it through the usual invalidation, and a
 * minute of staleness: the figures are counts over a period, not a live record.
 */
export const dashboardSummaryQueryOptions = (range: DashboardRange) =>
  queryOptions({
    ...getDashboardSummaryOptions({ query: { range } }),
    staleTime: 60_000,
  });
