import { AlertTriangle, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatCard } from '@/functionals/stat-card';
import { dataModelIcons } from '@/lib/data-model-icons';
import { cn } from '@/lib/utils';
import { formatDate } from '../../utils/instance-detail-overview.utils';
import { formatTimeUntil } from '../../utils/instance-detail.utils';
import type { useInstanceDetail } from './instance-detail-context';

type InstanceDetail = ReturnType<typeof useInstanceDetail>;

type InstanceDetailQuickStatsProps = {
  daysLeft: InstanceDetail['daysLeft'];
  endLicenseDate: string;
  entitlementsMetrics: InstanceDetail['entitlementsMetrics'];
  urgencyTextClassName: InstanceDetail['urgencyTextClassName'];
};

const EntitlementIcon = dataModelIcons.entitlement;

/**
 * The three figures under the header of an instance: when its license expires,
 * how many of its entitlements are still under their limit, and the usage
 * alerts.
 */
export function InstanceDetailQuickStats({
  daysLeft,
  endLicenseDate,
  entitlementsMetrics,
  urgencyTextClassName,
}: InstanceDetailQuickStatsProps) {
  const { i18n, t } = useTranslation();

  const entitlementsValueClassName =
    entitlementsMetrics.total === 0
      ? undefined
      : entitlementsMetrics.enabled === entitlementsMetrics.total
        ? 'text-success-subtle-foreground'
        : 'text-warning-subtle-foreground';
  // The tints belong to the alerts, not to the card: "0 near limit" stays
  // neutral so nothing draws the eye to a count of nothing. The icon takes the
  // gravest of the two.
  const nearLimitToneClassName =
    entitlementsMetrics.nearThreshold > 0
      ? 'text-warning-subtle-foreground'
      : undefined;
  const limitReachedToneClassName =
    entitlementsMetrics.limitReached > 0
      ? 'text-destructive-subtle-foreground'
      : undefined;
  // The cards' lines share the row's tracks. Each first line starts at the top
  // of its track, level with its neighbours whatever their type size, or a
  // date that wraps on a narrow screen. Each second line (a helper in two
  // cards, a second figure in the third) sits on one baseline at the bottom.
  const firstLineClassName = 'self-start';
  const secondLineClassName = 'self-baseline-last';
  // Two figures a size below the row's single ones, so the card holds both.
  const usageAlertsValueClassName = 'text-xl md:text-2xl';

  return (
    <StatCard.Row columnsClassName="md:grid-cols-3">
      <StatCard>
        <StatCard.Label>
          {t('Pages.Customers.Instances.Detail.quickStats.licenseExpires')}
        </StatCard.Label>
        <StatCard.Icon>
          <Calendar />
        </StatCard.Icon>
        <StatCard.Value
          className={cn(firstLineClassName, urgencyTextClassName)}
        >
          {daysLeft > 0
            ? formatDate(endLicenseDate)
            : t('Pages.Customers.Instances.Detail.quickStats.expired')}
        </StatCard.Value>
        <StatCard.Helper className={secondLineClassName}>
          {daysLeft > 0
            ? formatTimeUntil(daysLeft, i18n.resolvedLanguage)
            : formatDate(endLicenseDate)}
        </StatCard.Helper>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Customers.Instances.Detail.quickStats.entitlements')}
        </StatCard.Label>
        <StatCard.Icon>
          <EntitlementIcon />
        </StatCard.Icon>
        <StatCard.Value
          className={cn(firstLineClassName, entitlementsValueClassName)}
        >
          {entitlementsMetrics.enabled}/{entitlementsMetrics.total}
        </StatCard.Value>
        {/* What the fraction counts: the grants whose counter is not
            spent. A flag has no counter, so it counts as under its limit,
            even switched off. */}
        <StatCard.Helper className={secondLineClassName}>
          {t(
            'Pages.Customers.Instances.Detail.quickStats.entitlementsUnderLimit',
          )}
        </StatCard.Helper>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Customers.Instances.Detail.quickStats.usageAlerts')}
        </StatCard.Label>
        <StatCard.Icon
          className={limitReachedToneClassName ?? nearLimitToneClassName}
        >
          <AlertTriangle />
        </StatCard.Icon>
        <StatCard.Value
          className={cn(
            firstLineClassName,
            usageAlertsValueClassName,
            nearLimitToneClassName,
          )}
        >
          {entitlementsMetrics.nearThreshold}
          <StatCard.Unit>
            {t('Pages.Customers.Instances.Detail.quickStats.nearLimit')}
          </StatCard.Unit>
        </StatCard.Value>
        <StatCard.Value
          className={cn(
            usageAlertsValueClassName,
            // The first line, held at the top of a track sized for larger
            // figures, already leaves the room this padding would add.
            '[[data-slot=stat-card-value]+&]:pt-0',
            secondLineClassName,
            limitReachedToneClassName,
          )}
        >
          {entitlementsMetrics.limitReached}
          <StatCard.Unit>
            {t('Pages.Customers.Instances.Detail.quickStats.limitReached', {
              count: entitlementsMetrics.limitReached,
            })}
          </StatCard.Unit>
        </StatCard.Value>
        {/* Both scopes are worth an alert, but a period-scoped counter clears
            at the next reset while a lifetime one never does. */}
        {entitlementsMetrics.nearThresholdCurrentPeriod > 0 ? (
          <StatCard.Helper>
            {t(
              'Pages.Customers.Instances.Detail.quickStats.nearLimitCurrentPeriod',
              { count: entitlementsMetrics.nearThresholdCurrentPeriod },
            )}
          </StatCard.Helper>
        ) : null}
      </StatCard>
    </StatCard.Row>
  );
}
