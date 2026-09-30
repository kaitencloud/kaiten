import type { TFunction } from 'i18next';
import type { ChartConfig } from '@/components/ui/chart';

export const getLicenseExpirationForecastChartConfig = (t: TFunction) =>
  ({
    count: {
      label: t('Pages.Dashboard.chartLabels.instances'),
      color: 'var(--chart-1)',
    },
  }) satisfies ChartConfig;

export const getTopCustomersByInstancesChartConfig = (t: TFunction) =>
  ({
    instances: {
      label: t('Pages.Dashboard.chartLabels.instances'),
      color: 'var(--chart-2)',
    },
  }) satisfies ChartConfig;

export const getInstanceLifecycleTimelineChartConfig = (t: TFunction) =>
  ({
    created: {
      label: t('Pages.Dashboard.chartLabels.created'),
      color: 'var(--chart-1)',
    },
    started: {
      label: t('Pages.Dashboard.chartLabels.started'),
      color: 'var(--chart-2)',
    },
    ending: {
      label: t('Pages.Dashboard.chartLabels.ending'),
      color: 'var(--chart-3)',
    },
  }) satisfies ChartConfig;

export const getFeatureFlagsGovernanceChartConfig = (t: TFunction) =>
  ({
    enabled: {
      label: t('Pages.Dashboard.chartLabels.enabled'),
      color: 'var(--chart-2)',
    },
    disabled: {
      label: t('Pages.Dashboard.chartLabels.disabled'),
      color: 'var(--chart-5)',
    },
    count: {
      label: t('Pages.Dashboard.chartLabels.flags'),
      color: 'var(--chart-2)',
    },
  }) satisfies ChartConfig;

export const getFlagTargetingComplexityChartConfig = (t: TFunction) =>
  ({
    count: {
      label: t('Pages.Dashboard.chartLabels.flags'),
      color: 'var(--chart-3)',
    },
  }) satisfies ChartConfig;

export const getReleaseCadenceChartConfig = (t: TFunction) =>
  ({
    releases: {
      label: t('Pages.Dashboard.chartLabels.releases'),
      color: 'var(--chart-4)',
    },
  }) satisfies ChartConfig;

export const getReleaseCoverageByZoneChartConfig = (t: TFunction) =>
  ({
    zones: {
      label: t('Pages.Dashboard.chartLabels.zones'),
      color: 'var(--chart-1)',
    },
  }) satisfies ChartConfig;

export const getTokenSecurityPostureChartConfig = (t: TFunction) =>
  ({
    // Coloured by state, not by series order: a slice keeps its colour whatever
    // states happen to be present (see TOKEN_STATE_FILLS).
    healthy: {
      label: t('Pages.Dashboard.chartLabels.healthy'),
      color: 'var(--chart-1)',
    },
    expiringSoon: {
      label: t('Pages.Dashboard.chartLabels.expiringSoon'),
      color: 'var(--chart-3)',
    },
    expired: {
      label: t('Pages.Dashboard.chartLabels.expired'),
      color: 'var(--destructive)',
    },
    revoked: {
      label: t('Pages.Dashboard.chartLabels.revoked'),
      color: 'var(--chart-5)',
    },
    noExpiry: {
      label: t('Pages.Dashboard.chartLabels.noExpiry'),
      color: 'var(--chart-2)',
    },
    tokens: {
      label: t('Pages.Dashboard.chartLabels.tokens'),
      color: 'var(--chart-2)',
    },
  }) satisfies ChartConfig;
