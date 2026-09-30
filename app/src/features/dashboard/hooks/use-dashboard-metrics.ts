import { useMemo } from 'react';
import type { GetDashboardDataQuery } from '@/api-client/graphql/graphql';
import type { DashboardSupplementaryData } from '../queries/use-dashboard-data';
import { buildDashboardMetrics } from './dashboard-metrics.builders';

export type { DashboardMetrics } from './dashboard-metrics.types';

export const useDashboardMetrics = (
  data: GetDashboardDataQuery | undefined,
  supplementaryData: DashboardSupplementaryData | undefined,
) =>
  useMemo(
    () => buildDashboardMetrics(data, supplementaryData),
    [data, supplementaryData],
  );
