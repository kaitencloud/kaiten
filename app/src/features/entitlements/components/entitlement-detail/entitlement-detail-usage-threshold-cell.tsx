import type { TFunction } from 'i18next';
import {
  getHighestAcceptedUsage,
  isSoftLimit,
  isUnlimitedThreshold,
} from '@/domains/entitlement-usage';
import type { EnrichedUsage } from './entitlement-detail-context.types';

// The saturation column beside this one divides by what the grant permits, so
// a soft limit has to say so here or the two read as one contradictory pair.
export function UsageThresholdCell({
  locale,
  t,
  usage,
}: {
  locale: string;
  t: TFunction;
  usage: Pick<EnrichedUsage, 'limitCapExceededOveragePercent' | 'threshold'>;
}) {
  const { limitCapExceededOveragePercent, threshold } = usage;

  // Defensive: an unbounded grant is UNBOUNDED, and the at-risk table keeps
  // only the near- and over-limit rows, so it never reaches this cell today.
  if (threshold === null || isUnlimitedThreshold(threshold)) {
    return (
      <>
        {t(
          'Pages.Entitlements.Detail.Usage.atRiskInstances.unlimited',
          'Unlimited',
        )}
      </>
    );
  }

  const highestAcceptedUsage = getHighestAcceptedUsage(
    threshold,
    limitCapExceededOveragePercent,
  );

  return (
    <span className="flex items-baseline gap-1">
      <span>{threshold.toLocaleString(locale)}</span>
      {isSoftLimit(threshold, limitCapExceededOveragePercent) &&
      highestAcceptedUsage !== null ? (
        <span
          className="text-xs text-muted-foreground"
          title={t(
            'Pages.Entitlements.Detail.Usage.atRiskInstances.softLimitDescription',
            { max: highestAcceptedUsage.toLocaleString(locale) },
          )}
        >
          {t('Pages.Entitlements.Detail.Usage.atRiskInstances.softLimitHint', {
            percent: limitCapExceededOveragePercent,
          })}
        </span>
      ) : null}
    </span>
  );
}
