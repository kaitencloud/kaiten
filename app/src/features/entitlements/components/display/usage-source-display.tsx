import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { Badge } from '@/components/ui/badge';

export type UsageSource = NonNullable<Entitlement['usageSource']>;

type UsageSourceDisplayProps = {
  className?: string;
  /** Absent for a flag or a configuration, which have no usage to say the source of. */
  usageSource: UsageSource | null | undefined;
};

/**
 * Where the usage of a NUMBER entitlement comes from: a calculated one is reported
 * by the code of the vendor, a combined one is the weighted sum of other
 * entitlements. The combined one is the one that is told apart, with a badge.
 */
export function UsageSourceDisplay({
  className = 'text-sm font-medium',
  usageSource,
}: UsageSourceDisplayProps) {
  const { t } = useTranslation();

  if (!usageSource) {
    return (
      <span className={`${className} text-muted-foreground`}>
        {t('Pages.Entitlements.Detail.fallback.notAvailable', 'n/a')}
      </span>
    );
  }

  if (usageSource === 'COMBINED_USAGE') {
    return (
      <Badge variant="outline">
        {t(`Pages.Entitlements.UsageSources.${usageSource}`)}
      </Badge>
    );
  }

  return (
    <span className={className}>
      {t(`Pages.Entitlements.UsageSources.${usageSource}`)}
    </span>
  );
}
