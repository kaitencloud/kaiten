import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  getMaximumAllowedUsage,
  getUsagePercentage,
  getUsageStatus,
  getUsageStatusTone,
  isUnlimitedThreshold,
  isUsageAtRisk,
  UsageMeter,
  UsageStatusBadge,
} from '@/domains/entitlement-usage';
import { formatUsageWindowBound } from '@/lib/detail';
import type { useInstanceDetail } from '../../instance-detail-context';
import { SoftLimitHint } from './instance-detail-entitlements-columns';

type InstanceEntitlementsMetrics = ReturnType<
  typeof useInstanceDetail
>['entitlementsMetrics'];

type NumberEntitlement =
  InstanceEntitlementsMetrics['numberEntitlements'][number];

// Per row rather than as a card-wide caption: each entitlement carries its own
// cadence, and a LICENSE_START anchor phases the window off the instance's own
// license start date, so two meters on the same instance rarely share bounds.
// One caption would therefore be right for at most one bar and quietly wrong
// for the others. Absent bounds mean a lifetime counter, not missing data --
// and the card only ever renders NUMBER entitlements, so unlike the table
// column beside it there is no non-numeric case to exclude here.
const getUsageWindowLabel = (
  entitlement: NumberEntitlement,
  locale: string,
  t: ReturnType<typeof useTranslation>['t'],
) => {
  const { currentPeriodEnd, currentPeriodStart } = entitlement;

  if (!currentPeriodStart || !currentPeriodEnd) {
    // Shares the table column's key rather than owning a second one: the two
    // sit on the same tab, so a separate string would only be a way to drift.
    return t('Pages.Customers.Instances.Detail.entitlements.lifetime');
  }

  return t(
    'Pages.Customers.Instances.Detail.entitlements.usage.currentWindow',
    {
      end: formatUsageWindowBound(currentPeriodEnd, locale),
      start: formatUsageWindowBound(currentPeriodStart, locale),
    },
  );
};

export function EntitlementsUsageCard({
  entitlementsMetrics,
  locale,
}: {
  entitlementsMetrics: InstanceEntitlementsMetrics;
  locale: string;
}) {
  const { t } = useTranslation();
  const renderUsageRow = (entitlement: NumberEntitlement) => {
    // The percentage measures what the grant permits, so the granted figure
    // beside it needs its allowance spelled out or the two read as one
    // contradictory fraction. The meter draws the grant and the allowance
    // apart, and the figures take the colour of the same status it shows.
    const maximumAllowedUsage = getMaximumAllowedUsage(
      entitlement.threshold,
      entitlement.limitCapExceededOveragePercent,
    );
    const percentage = getUsagePercentage(
      entitlement.value,
      entitlement.threshold,
      entitlement.limitCapExceededOveragePercent,
    );
    const status = getUsageStatus(
      entitlement.value,
      entitlement.threshold,
      entitlement.limitCapExceededOveragePercent,
    );
    const tone = getUsageStatusTone(status);

    return (
      <div key={entitlement.entitlementId} className="space-y-2">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {entitlement.entitlementName}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`text-sm font-medium ${tone.text}`}>
                {entitlement.value.toLocaleString(locale)}
              </span>
              <span className="text-sm text-muted-foreground">/</span>
              <span className="text-sm text-muted-foreground">
                {entitlement.threshold === null
                  ? '-'
                  : isUnlimitedThreshold(entitlement.threshold)
                    ? t(
                        'Pages.Customers.Instances.Detail.entitlements.unlimited',
                      )
                    : entitlement.threshold.toLocaleString(locale)}
              </span>
              <SoftLimitHint locale={locale} row={entitlement} t={t} />
              {maximumAllowedUsage === null ? null : (
                <span className={`text-xs font-medium ${tone.text}`}>
                  ({percentage}%)
                </span>
              )}
              {isUsageAtRisk(status) ? (
                <UsageStatusBadge status={status} />
              ) : null}
            </div>
          </div>
          {/* Full width rather than beside the name: the UTC bounds are long
              enough to wrap into a four-line column on a phone otherwise. */}
          <span className="block text-xs text-muted-foreground">
            {getUsageWindowLabel(entitlement, locale, t)}
          </span>
        </div>
        <UsageMeter
          limitCapExceededOveragePercent={
            entitlement.limitCapExceededOveragePercent
          }
          threshold={entitlement.threshold}
          value={entitlement.value}
        />
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('Pages.Customers.Instances.Detail.entitlements.usage.title')}
        </CardTitle>
        <CardDescription>
          {t('Pages.Customers.Instances.Detail.entitlements.usage.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entitlementsMetrics.numberEntitlements.length > 0 ? (
          <div className="space-y-4 lg:space-y-6">
            {entitlementsMetrics.numberEntitlements.map(renderUsageRow)}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {t('Pages.Customers.Instances.Detail.entitlements.empty')}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
