import { addMonths, startOfMonth } from 'date-fns';
import type { Instance, Token } from '@/api-client';
import type { GetDashboardDataQuery } from '@/api-client/graphql/graphql';
import type { DashboardMetrics } from './dashboard-metrics.types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

/**
 * One fill per lifecycle state, so a slice keeps its colour whatever order the
 * states appear in. Coloured by index, a lone revoked token took the accent
 * and read as the healthy state.
 */
export const TOKEN_STATE_FILLS: Record<TokenStateKey, string> = {
  healthy: 'var(--chart-1)',
  noExpiry: 'var(--chart-2)',
  expiringSoon: 'var(--chart-3)',
  expired: 'var(--destructive)',
  revoked: 'var(--chart-5)',
};

export const EMPTY_DASHBOARD_METRICS: DashboardMetrics = {
  charts: {
    entitlementSaturationHeatmap: [],
    featureFlagsGovernance: {
      enabledDisabled: [],
      typeDistribution: [],
    },
    flagTargetingComplexity: [],
    instanceLifecycleTimeline: [],
    licenseExpirationForecast: [],
    releaseCadence: [],
    releaseCoverageByZone: [],
    tokenSecurityPosture: [],
    topCustomersByInstances: [],
  },
  summary: {
    activeInstances: 0,
    customers: 0,
    expiringIn30Days: 0,
    expiringIn60Days: 0,
    featureFlagsEnabled: 0,
    featureFlagsTotal: 0,
    licenses: 0,
    nearThresholdUsage: 0,
    nearThresholdUsageCurrentPeriod: 0,
    overThresholdUsage: 0,
    releases: 0,
    serviceAccounts: 0,
    tokensActive: 0,
    tokensExpiringSoon: 0,
    tokensTotal: 0,
    zonesTotal: 0,
    zonesWithRelease: 0,
  },
};

type MonthlySeriesEntry = {
  created: number;
  ending: number;
  started: number;
  timestamp: number;
};

type MonthlySeriesCounts = {
  created: number;
  ending: number;
  started: number;
};

export type TokenStateKey =
  | 'expired'
  | 'expiringSoon'
  | 'healthy'
  | 'noExpiry'
  | 'revoked';

export const toDate = (
  value: Date | string | null | undefined,
): Date | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const buildMonthlySeries = (
  dates: Array<Date | null>,
  byTimestamp: Map<number, MonthlySeriesCounts>,
) => {
  const parsedDates = dates.filter((date): date is Date => date !== null);

  if (parsedDates.length === 0) {
    return [] as MonthlySeriesEntry[];
  }

  const minMonth = startOfMonth(
    parsedDates.reduce((current, date) => (date < current ? date : current)),
  );
  const maxMonth = startOfMonth(
    parsedDates.reduce((current, date) => (date > current ? date : current)),
  );
  const monthlySeries: MonthlySeriesEntry[] = [];

  for (
    let currentMonth = minMonth;
    currentMonth <= maxMonth;
    currentMonth = addMonths(currentMonth, 1)
  ) {
    const timestamp = currentMonth.getTime();
    const entry = byTimestamp.get(timestamp);

    monthlySeries.push({
      created: entry?.created ?? 0,
      ending: entry?.ending ?? 0,
      started: entry?.started ?? 0,
      timestamp,
    });
  }

  return monthlySeries;
};

export const getChartFill = (
  index: number,
  palette: readonly string[] = CHART_COLORS,
) => palette[index % palette.length];

export const getDaysUntil = (date: Date, now: Date) =>
  Math.ceil((date.getTime() - now.getTime()) / DAY_IN_MS);

export const getLicenseSlug = (
  instance:
    | Pick<Instance, 'licenseSlug'>
    | GetDashboardDataQuery['instances']['items'][number],
) => {
  if ('license' in instance && typeof instance.license?.slug === 'string') {
    return instance.license.slug;
  }

  if ('licenseSlug' in instance && typeof instance.licenseSlug === 'string') {
    return instance.licenseSlug;
  }

  return '';
};

export const classifyTokenState = (token: Token, now: Date): TokenStateKey => {
  if (token.revokedAt) {
    return 'revoked';
  }

  if (!token.expiresAt) {
    return 'noExpiry';
  }

  const expiresAt = toDate(token.expiresAt);

  if (!expiresAt) {
    return 'noExpiry';
  }

  if (expiresAt < now) {
    return 'expired';
  }

  return getDaysUntil(expiresAt, now) <= 30 ? 'expiringSoon' : 'healthy';
};
