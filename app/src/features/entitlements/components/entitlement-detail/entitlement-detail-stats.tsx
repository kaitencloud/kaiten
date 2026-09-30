import { AlertTriangle, CheckCircle2, Layers, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  StatsCardsRow,
  type StatsCardsRowItem,
} from '@/functionals/stats-cards-row';
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
const getEntitlementStatsItems = ({
  isLoading,
  isUsageLoading,
  locale,
  metrics,
  t,
}: EntitlementDetailStatsProps & {
  t: ReturnType<typeof useTranslation>['t'];
}): StatsCardsRowItem[] => {
  return [
    {
      id: 'entitlement-linked-licenses',
      label: t(
        'Pages.Entitlements.Detail.stats.linkedLicenses.label',
        'Linked licenses',
      ),
      value: formatMetricCount(metrics.linkedLicenses, isLoading, locale),
      helper: t(
        'Pages.Entitlements.Detail.stats.linkedLicenses.helper',
        'Licenses containing this entitlement',
      ),
      Icon: Layers,
    },
    {
      id: 'entitlement-license-alerts',
      label: t(
        'Pages.Entitlements.Detail.stats.licenseAlerts.label',
        'License alerts',
      ),
      value: formatMetricCount(
        metrics.nearLimitLicenses + metrics.overLimitLicenses,
        isUsageLoading,
        locale,
      ),
      helper: (
        <div className="flex flex-wrap items-center gap-2">
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
          {/* The share is 0% whenever both counts are, so it only earns its
              place, and its second line, once there is an alert to weigh. */}
          {isUsageLoading ||
          metrics.nearLimitLicenses + metrics.overLimitLicenses === 0 ? null : (
            <span
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
            </span>
          )}
        </div>
      ),
      Icon: AlertTriangle,
      // The warning tint belongs to an alert, not to the card: at zero the
      // icon stays neutral so nothing draws the eye to a count of nothing.
      iconClassName:
        metrics.nearLimitLicenses + metrics.overLimitLicenses > 0
          ? 'text-warning-subtle-foreground'
          : undefined,
    },
    {
      id: 'entitlement-unlimited-mappings',
      label: t(
        'Pages.Entitlements.Detail.stats.unlimitedMappings.label',
        'Unlimited mappings',
      ),
      value: formatMetricCount(metrics.unlimitedMappings, isLoading, locale),
      helper: t(
        'Pages.Entitlements.Detail.stats.unlimitedMappings.helper',
        'Linked licenses with no limit',
      ),
      Icon: CheckCircle2,
    },
    {
      id: 'entitlement-impact-scope',
      label: t(
        'Pages.Entitlements.Detail.stats.impactScope.label',
        'Impact scope',
      ),
      value: formatMetricCount(metrics.impactedInstances, isLoading, locale),
      helper: (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {formatMetricCount(metrics.impactedCustomers, isLoading, locale)}{' '}
            {t('Pages.Entitlements.Detail.stats.impactScope.customers', {
              count: metrics.impactedCustomers,
            })}
          </span>
          <span>
            {formatMetricCount(metrics.atRiskInstances, isUsageLoading, locale)}{' '}
            {t('Pages.Entitlements.Detail.stats.impactScope.atRisk', {
              count: metrics.atRiskInstances,
            })}
          </span>
        </div>
      ),
      Icon: Users,
    },
  ];
};

export function EntitlementDetailStats({
  isLoading,
  isUsageLoading,
  locale,
  metrics,
}: EntitlementDetailStatsProps) {
  const { t } = useTranslation();

  return (
    <StatsCardsRow
      className="gap-4 lg:gap-6"
      columnsClassName="md:grid-cols-2 xl:grid-cols-4"
      items={getEntitlementStatsItems({
        isLoading,
        isUsageLoading,
        locale,
        metrics,
        t,
      })}
    />
  );
}
