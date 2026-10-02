import { CheckCircle, Target, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FeatureFlag } from '@/api-client';
import { StatCard } from '@/functionals/stat-card';
import { dataModelIcons } from '@/lib/data-model-icons';

export function FeatureFlagStatsCards({
  featureFlags,
}: {
  featureFlags: FeatureFlag[];
}) {
  const { t } = useTranslation();
  const FeatureFlagIcon = dataModelIcons.featureFlag;

  const enabled = featureFlags.filter((f) => f.enabled).length;
  const disabled = featureFlags.filter((f) => !f.enabled).length;
  const withTargeting = featureFlags.filter(
    (f) => f.targetings && f.targetings.length > 0,
  ).length;

  return (
    <StatCard.Row>
      <StatCard>
        <StatCard.Label>
          {t('Pages.FeatureFlags.Stats.totalFlags')}
        </StatCard.Label>
        <StatCard.Icon>
          <FeatureFlagIcon />
        </StatCard.Icon>
        <StatCard.Value>{featureFlags.length}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>{t('Pages.FeatureFlags.Stats.enabled')}</StatCard.Label>
        <StatCard.Icon className="text-success-subtle-foreground">
          <CheckCircle />
        </StatCard.Icon>
        <StatCard.Value className="text-success-subtle-foreground">
          {enabled}
        </StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.FeatureFlags.Stats.disabled')}
        </StatCard.Label>
        <StatCard.Icon>
          <XCircle />
        </StatCard.Icon>
        <StatCard.Value>{disabled}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.FeatureFlags.Stats.withTargeting')}
        </StatCard.Label>
        <StatCard.Icon className="text-primary-subtle-foreground">
          <Target />
        </StatCard.Icon>
        <StatCard.Value className="text-primary-subtle-foreground">
          {withTargeting}
        </StatCard.Value>
      </StatCard>
    </StatCard.Row>
  );
}
