import { AlertTriangle, CheckCircle2, Layers, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatCard } from '@/functionals/stat-card';
import { cn } from '@/lib/utils';
import {
  formatMetricCount,
  getRiskRatioClassName,
} from './entitlement-detail-overview.helpers';
import type { EntitlementDetailMetrics } from './entitlement-detail-overview.types';

type EntitlementDetailStatsProps = {
  isLoading: boolean;
  isUsageLoading: boolean;
  locale: string;
  metrics: EntitlementDetailMetrics;
};

// The strip is the one home of every count on the page: the overview below
// lists the licenses behind them rather than repeating the numbers.
export function EntitlementDetailStats({
  isLoading,
  isUsageLoading,
  locale,
  metrics,
}: EntitlementDetailStatsProps) {
  const { t } = useTranslation();
  const alertsCount = metrics.nearLimitLicenses + metrics.overLimitLicenses;

  return (
    <StatCard.Row>
      <StatCard>
        <StatCard.Label>
          {t(
            'Pages.Entitlements.Detail.stats.linkedLicenses.label',
            'Linked licenses',
          )}
        </StatCard.Label>
        <StatCard.Icon>
          <Layers />
        </StatCard.Icon>
        <StatCard.Value>
          {formatMetricCount(metrics.linkedLicenses, isLoading, locale)}
        </StatCard.Value>
        <StatCard.Helper>
          {t(
            'Pages.Entitlements.Detail.stats.linkedLicenses.helper',
            'Licenses containing this entitlement',
          )}
        </StatCard.Helper>
      </StatCard>

      <StatCard>
        <StatCard.Label>
          {t(
            'Pages.Entitlements.Detail.stats.licenseAlerts.label',
            'License alerts',
          )}
        </StatCard.Label>
        {/* The warning tint belongs to an alert, not to the card: at zero the
            icon stays neutral so nothing draws the eye to a count of nothing. */}
        <StatCard.Icon
          className={
            alertsCount > 0 ? 'text-warning-subtle-foreground' : undefined
          }
        >
          <AlertTriangle />
        </StatCard.Icon>
        <StatCard.Value>
          {formatMetricCount(alertsCount, isUsageLoading, locale)}
        </StatCard.Value>
        <StatCard.Helper className="flex flex-wrap gap-x-2">
          <span>
            {t(
              'Pages.Entitlements.Detail.stats.licenseAlerts.near',
              'Near limit',
            )}
            :{' '}
            {formatMetricCount(
              metrics.nearLimitLicenses,
              isUsageLoading,
              locale,
            )}
          </span>
          <span>
            {t(
              'Pages.Entitlements.Detail.stats.licenseAlerts.over',
              'Over limit',
            )}
            :{' '}
            {formatMetricCount(
              metrics.overLimitLicenses,
              isUsageLoading,
              locale,
            )}
          </span>
        </StatCard.Helper>
        {/* The share is 0% whenever both counts are, so it only earns its
            place, and its second line, once there is an alert to weigh. */}
        {isUsageLoading || alertsCount === 0 ? null : (
          <StatCard.Helper
            className={cn(
              'font-medium',
              getRiskRatioClassName(metrics.riskRatioPercent),
            )}
          >
            {t(
              'Pages.Entitlements.Detail.stats.licenseAlerts.ratio',
              '{{percent}}% of linked licenses',
              { percent: metrics.riskRatioPercent.toLocaleString(locale) },
            )}
          </StatCard.Helper>
        )}
      </StatCard>

      <StatCard>
        <StatCard.Label>
          {t(
            'Pages.Entitlements.Detail.stats.unlimitedMappings.label',
            'Unlimited mappings',
          )}
        </StatCard.Label>
        <StatCard.Icon>
          <CheckCircle2 />
        </StatCard.Icon>
        <StatCard.Value>
          {formatMetricCount(metrics.unlimitedMappings, isLoading, locale)}
        </StatCard.Value>
        <StatCard.Helper>
          {t(
            'Pages.Entitlements.Detail.stats.unlimitedMappings.helper',
            'Linked licenses with no limit',
          )}
        </StatCard.Helper>
      </StatCard>

      <StatCard>
        <StatCard.Label>
          {t(
            'Pages.Entitlements.Detail.stats.impactScope.label',
            'Impact scope',
          )}
        </StatCard.Label>
        <StatCard.Icon>
          <Users />
        </StatCard.Icon>
        <StatCard.Value>
          {formatMetricCount(metrics.impactedInstances, isLoading, locale)}
        </StatCard.Value>
        <StatCard.Helper>
          {formatMetricCount(metrics.impactedCustomers, isLoading, locale)}{' '}
          {t('Pages.Entitlements.Detail.stats.impactScope.customers', {
            count: metrics.impactedCustomers,
          })}
        </StatCard.Helper>
        <StatCard.Helper>
          {formatMetricCount(metrics.atRiskInstances, isUsageLoading, locale)}{' '}
          {t('Pages.Entitlements.Detail.stats.impactScope.atRisk', {
            count: metrics.atRiskInstances,
          })}
        </StatCard.Helper>
      </StatCard>
    </StatCard.Row>
  );
}
