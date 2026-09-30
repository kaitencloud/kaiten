import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertTriangle, Layers, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DashboardMetrics } from '../../hooks/use-dashboard-metrics';

type DashboardInsightCardsProps = {
  summary: DashboardMetrics['summary'];
};

export const DashboardInsightCards = ({
  summary,
}: DashboardInsightCardsProps) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-warning-subtle-foreground" />
            {t('Pages.Dashboard.insights.entitlementAlerts.title')}
          </CardDescription>
          <CardTitle className="text-3xl text-warning-subtle-foreground">
            {summary.nearThresholdUsage}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Sits directly under the headline because "of these" refers to
              it: the split is a subset of the near-threshold count and has no
              relation to the over-limit sentence below -- those two
              populations are disjoint, so under it this line could read
              "3 of 1". */}
          {summary.nearThresholdUsageCurrentPeriod > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('Pages.Dashboard.insights.entitlementAlerts.currentPeriod', {
                count: summary.nearThresholdUsageCurrentPeriod,
              })}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Pages.Dashboard.insights.entitlementAlerts.description', {
              count: summary.overThresholdUsage,
            })}
          </p>
        </CardContent>
      </Card>

      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2 text-base">
            <Layers className="size-4 text-primary-subtle-foreground" />
            {t('Pages.Dashboard.insights.releaseCoverage.title')}
          </CardDescription>
          <CardTitle className="text-3xl">
            {summary.zonesWithRelease}/{summary.zonesTotal}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('Pages.Dashboard.insights.releaseCoverage.description')}
          </p>
        </CardContent>
      </Card>

      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-success-subtle-foreground" />
            {t('Pages.Dashboard.insights.automationSurface.title')}
          </CardDescription>
          <CardTitle className="text-3xl">{summary.serviceAccounts}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('Pages.Dashboard.insights.automationSurface.description', {
              count: summary.tokensTotal,
            })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
