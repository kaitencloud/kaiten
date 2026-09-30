import { Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { useDashboardMetrics } from '../hooks/use-dashboard-metrics';
import {
  useDashboardData,
  useDashboardSupplementaryData,
} from '../queries/use-dashboard-data';
import { DashboardInsightCards } from './cards';
import { DashboardStatsCards } from './cards/dashboard-stats-cards';
import {
  EntitlementSaturationHeatmapChart,
  FeatureFlagsGovernanceChart,
  FlagTargetingComplexityChart,
  InstanceLifecycleTimelineChart,
  LicenseExpirationForecastChart,
  ReleaseCadenceChart,
  ReleaseCoverageByZoneChart,
  TokenSecurityPostureChart,
  TopCustomersByInstancesChart,
} from './charts';

export function DashboardPageContent() {
  const { t } = useTranslation();
  const dashboardQuery = useDashboardData();
  const supplementaryQuery = useDashboardSupplementaryData(dashboardQuery.data);
  const metrics = useDashboardMetrics(
    dashboardQuery.data,
    supplementaryQuery.data,
  );

  if (dashboardQuery.isLoading) {
    return (
      <Page className="h-full min-h-0 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-6">
          <Page.Header className="sticky top-0 z-20 bg-app-background py-2">
            <Page.Title>{t('Pages.Dashboard.title')}</Page.Title>
          </Page.Header>
          <div className="flex min-h-[400px] items-center justify-center">
            <p>{t('Pages.Dashboard.loading')}</p>
          </div>
        </div>
      </Page>
    );
  }

  if (dashboardQuery.error) {
    return (
      <Page className="h-full min-h-0 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-6">
          <Page.Header className="sticky top-0 z-20 bg-app-background py-2">
            <Page.Title>{t('Pages.Dashboard.title')}</Page.Title>
          </Page.Header>
          <div className="flex min-h-[400px] items-center justify-center">
            <p className="text-destructive-subtle-foreground">
              {t('Pages.Dashboard.errorLoadingData')}
            </p>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-6">
        <Page.Header className="sticky top-0 z-20 bg-app-background py-2">
          <Page.Leading>
            <Page.Icon>
              <Gauge className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.Title>{t('Pages.Dashboard.title')}</Page.Title>
              <Page.Subtitle>{t('Pages.Dashboard.subtitle')}</Page.Subtitle>
            </Page.Heading>
          </Page.Leading>
        </Page.Header>

        <div className="mt-6 space-y-6">
          <DashboardStatsCards summary={metrics.summary} />
          <DashboardInsightCards summary={metrics.summary} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-4">
              <LicenseExpirationForecastChart
                data={metrics.charts.licenseExpirationForecast}
              />
            </div>
            <div className="xl:col-span-4">
              <TopCustomersByInstancesChart
                data={metrics.charts.topCustomersByInstances}
              />
            </div>
            <div className="xl:col-span-4">
              <TokenSecurityPostureChart
                data={metrics.charts.tokenSecurityPosture}
              />
            </div>

            <div className="xl:col-span-8">
              <InstanceLifecycleTimelineChart
                data={metrics.charts.instanceLifecycleTimeline}
              />
            </div>
            <div className="xl:col-span-4">
              <ReleaseCadenceChart data={metrics.charts.releaseCadence} />
            </div>

            <div className="xl:col-span-6">
              <ReleaseCoverageByZoneChart
                data={metrics.charts.releaseCoverageByZone}
              />
            </div>
            <div className="xl:col-span-6">
              <FlagTargetingComplexityChart
                data={metrics.charts.flagTargetingComplexity}
              />
            </div>

            <div className="xl:col-span-6">
              <FeatureFlagsGovernanceChart
                data={metrics.charts.featureFlagsGovernance}
              />
            </div>
            <div className="xl:col-span-6">
              <EntitlementSaturationHeatmapChart
                data={metrics.charts.entitlementSaturationHeatmap}
              />
            </div>
          </div>

          {supplementaryQuery.isFetching ? (
            <p className="text-xs text-muted-foreground">
              {t('Pages.Dashboard.refreshingInsights')}
            </p>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
