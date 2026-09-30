import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';

// Derived from the generated client rather than hand-copied like the sibling
// AggregationMethod/EntitlementType unions: this pair is young enough that the
// API is still the only place worth stating it.
export type ResetPeriod = NonNullable<Entitlement['resetPeriod']>;
export type ResetAnchor = NonNullable<Entitlement['resetAnchor']>;

interface ResetPeriodDisplayProps {
  className?: string;
  resetPeriod: ResetPeriod | null | undefined;
}

/**
 * Renders the cadence of an entitlement's usage window. An absent period is
 * not missing data -- it is the lifetime counter, so it gets a real label
 * rather than the n/a fallback.
 */
export function ResetPeriodDisplay({
  className = 'text-sm font-medium',
  resetPeriod,
}: ResetPeriodDisplayProps) {
  const { t } = useTranslation();

  if (!resetPeriod) {
    return (
      <span className={`${className} text-muted-foreground`}>
        {t('Pages.Entitlements.ResetPeriods.NONE')}
      </span>
    );
  }

  return (
    <span className={className}>
      {t(`Pages.Entitlements.ResetPeriods.${resetPeriod}`)}
    </span>
  );
}

interface ResetAnchorDisplayProps {
  className?: string;
  resetAnchor: ResetAnchor | null | undefined;
}

export function ResetAnchorDisplay({
  className = 'text-sm font-medium',
  resetAnchor,
}: ResetAnchorDisplayProps) {
  const { t } = useTranslation();

  if (!resetAnchor) {
    return (
      <span className={`${className} text-muted-foreground`}>
        {t('Pages.Entitlements.Detail.fallback.notAvailable', 'n/a')}
      </span>
    );
  }

  return (
    <span className={className}>
      {t(`Pages.Entitlements.ResetAnchors.${resetAnchor}`)}
    </span>
  );
}
