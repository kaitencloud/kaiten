import { Activity, Percent, Tag, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FeatureFlag } from '@/api-client';
import { StatBadgeValue, StatCard } from '@/functionals/stat-card';
import { formatNumber, getDefaultVariantTypeLabel } from './shared';

type FeatureFlagDetailStatsProps = {
  defaultDistributionTotal: number | null;
  featureFlag: FeatureFlag;
  locale: string;
  sampleEvaluationsCount: number;
  targetingsCount: number;
};

export function FeatureFlagDetailStats({
  defaultDistributionTotal,
  featureFlag,
  locale,
  sampleEvaluationsCount,
  targetingsCount,
}: FeatureFlagDetailStatsProps) {
  const { t } = useTranslation();
  const rolloutRulesCount = (featureFlag.targetings ?? []).filter(
    (targeting) => targeting.type !== 'basic',
  ).length;

  return (
    <StatCard.Row>
      <StatCard>
        <StatCard.Label>
          {t('Pages.FeatureFlags.Detail.stats.variants.label')}
        </StatCard.Label>
        <StatCard.Icon>
          <Tag />
        </StatCard.Icon>
        <StatCard.Value>{featureFlag.variants?.length ?? 0}</StatCard.Value>
        <StatCard.Helper>
          {t('Pages.FeatureFlags.Detail.stats.variants.helper')}
        </StatCard.Helper>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.FeatureFlags.Detail.stats.targetingRules.label')}
        </StatCard.Label>
        <StatCard.Icon>
          <Target />
        </StatCard.Icon>
        <StatCard.Value>{targetingsCount}</StatCard.Value>
        <StatCard.Helper>
          {t('Pages.FeatureFlags.Detail.stats.targetingRules.helper', {
            count: rolloutRulesCount,
          })}
        </StatCard.Helper>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.FeatureFlags.Detail.stats.evaluations.label')}
        </StatCard.Label>
        <StatCard.Icon>
          <Activity />
        </StatCard.Icon>
        <StatCard.Value>
          {formatNumber(sampleEvaluationsCount, locale)}
        </StatCard.Value>
        <StatCard.Helper>
          {t('Pages.FeatureFlags.Detail.stats.evaluations.helper')}
        </StatCard.Helper>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.FeatureFlags.Detail.stats.defaultStrategy.label')}
        </StatCard.Label>
        <StatCard.Icon>
          <Percent />
        </StatCard.Icon>
        <StatCard.Value>
          <StatBadgeValue>
            {getDefaultVariantTypeLabel(featureFlag.default_variant.type, t)}
          </StatBadgeValue>
        </StatCard.Value>
        <StatCard.Helper>
          {defaultDistributionTotal !== null
            ? t(
                'Pages.FeatureFlags.Detail.stats.defaultStrategy.helperDistribution',
                { count: defaultDistributionTotal },
              )
            : t('Pages.FeatureFlags.Detail.stats.defaultStrategy.helperSingle')}
        </StatCard.Helper>
      </StatCard>
    </StatCard.Row>
  );
}
