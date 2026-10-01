import { AlertTriangle, Layers, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatCard } from '@/functionals/stat-card';
import type { DashboardMetrics } from '../../hooks/use-dashboard-metrics';

type DashboardInsightCardsProps = {
  summary: DashboardMetrics['summary'];
};

// The same cards as the figures above, so the dashboard reads as one strip;
// one column up to `xl`, where their helpers have room to stay on one line.
export const DashboardInsightCards = ({
  summary,
}: DashboardInsightCardsProps) => {
  const { t } = useTranslation();

  return (
    <StatCard.Row className="grid-cols-1" columnsClassName="xl:grid-cols-3">
      <StatCard>
        <StatCard.Label>
          {t('Pages.Dashboard.insights.entitlementAlerts.title')}
        </StatCard.Label>
        <StatCard.Icon className="text-warning-subtle-foreground">
          <AlertTriangle />
        </StatCard.Icon>
        <StatCard.Value className="text-warning-subtle-foreground">
          {summary.nearThresholdUsage}
        </StatCard.Value>
        {/* Sits directly under the headline because "of these" refers to it:
            the split is a subset of the near-threshold count and has no
            relation to the over-limit sentence below -- those two
            populations are disjoint, so under it this line could read
            "3 of 1". */}
        {summary.nearThresholdUsageCurrentPeriod > 0 ? (
          <StatCard.Helper>
            {t('Pages.Dashboard.insights.entitlementAlerts.currentPeriod', {
              count: summary.nearThresholdUsageCurrentPeriod,
            })}
          </StatCard.Helper>
        ) : null}
        <StatCard.Helper>
          {t('Pages.Dashboard.insights.entitlementAlerts.description', {
            count: summary.overThresholdUsage,
          })}
        </StatCard.Helper>
      </StatCard>

      <StatCard>
        <StatCard.Label>
          {t('Pages.Dashboard.insights.releaseCoverage.title')}
        </StatCard.Label>
        <StatCard.Icon className="text-primary-subtle-foreground">
          <Layers />
        </StatCard.Icon>
        <StatCard.Value>
          {summary.zonesWithRelease}/{summary.zonesTotal}
        </StatCard.Value>
        <StatCard.Helper>
          {t('Pages.Dashboard.insights.releaseCoverage.description')}
        </StatCard.Helper>
      </StatCard>

      <StatCard>
        <StatCard.Label>
          {t('Pages.Dashboard.insights.automationSurface.title')}
        </StatCard.Label>
        <StatCard.Icon className="text-success-subtle-foreground">
          <ShieldCheck />
        </StatCard.Icon>
        <StatCard.Value>{summary.serviceAccounts}</StatCard.Value>
        <StatCard.Helper>
          {t('Pages.Dashboard.insights.automationSurface.description', {
            count: summary.tokensTotal,
          })}
        </StatCard.Helper>
      </StatCard>
    </StatCard.Row>
  );
};
