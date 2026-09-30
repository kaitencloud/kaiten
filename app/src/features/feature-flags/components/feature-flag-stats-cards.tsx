import { CheckCircle, Flag, Target, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FeatureFlag } from '@/api-client';
import { StatsCardsRow } from '@/functionals/stats-cards-row';

export function FeatureFlagStatsCards({
  featureFlags,
}: {
  featureFlags: FeatureFlag[];
}) {
  const { t } = useTranslation();

  const enabled = featureFlags.filter((f) => f.enabled).length;
  const disabled = featureFlags.filter((f) => !f.enabled).length;
  const withTargeting = featureFlags.filter(
    (f) => f.targetings && f.targetings.length > 0,
  ).length;

  return (
    <StatsCardsRow
      items={[
        {
          id: 'total-flags',
          label: t('Pages.FeatureFlags.Stats.totalFlags'),
          value: featureFlags.length,
          Icon: Flag,
        },
        {
          id: 'enabled',
          label: t('Pages.FeatureFlags.Stats.enabled'),
          value: enabled,
          Icon: CheckCircle,
          iconClassName: 'text-success-subtle-foreground',
          valueClassName: 'text-success-subtle-foreground',
        },
        {
          id: 'disabled',
          label: t('Pages.FeatureFlags.Stats.disabled'),
          value: disabled,
          Icon: XCircle,
        },
        {
          id: 'with-targeting',
          label: t('Pages.FeatureFlags.Stats.withTargeting'),
          value: withTargeting,
          Icon: Target,
          iconClassName: 'text-primary-subtle-foreground',
          valueClassName: 'text-primary-subtle-foreground',
        },
      ]}
    />
  );
}
