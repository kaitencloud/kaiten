import { Activity, Percent, Tag, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FeatureFlag } from '@/api-client';
import { StatBadgeValue, StatsCardsRow } from '@/functionals/stats-cards-row';
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
    <StatsCardsRow
      className="gap-4 lg:gap-6"
      columnsClassName="md:grid-cols-2 xl:grid-cols-4"
      items={[
        {
          id: 'feature-flag-variants',
          label: t('Pages.FeatureFlags.Detail.stats.variants.label'),
          value: String(featureFlag.variants?.length ?? 0),
          helper: t('Pages.FeatureFlags.Detail.stats.variants.helper'),
          Icon: Tag,
        },
        {
          id: 'feature-flag-targeting-rules',
          label: t('Pages.FeatureFlags.Detail.stats.targetingRules.label'),
          value: String(targetingsCount),
          helper: t('Pages.FeatureFlags.Detail.stats.targetingRules.helper', {
            count: rolloutRulesCount,
          }),
          Icon: Target,
        },
        {
          id: 'feature-flag-evaluations',
          label: t('Pages.FeatureFlags.Detail.stats.evaluations.label'),
          value: formatNumber(sampleEvaluationsCount, locale),
          helper: t('Pages.FeatureFlags.Detail.stats.evaluations.helper'),
          Icon: Activity,
        },
        {
          id: 'feature-flag-default-strategy',
          label: t('Pages.FeatureFlags.Detail.stats.defaultStrategy.label'),
          value: (
            <StatBadgeValue>
              {getDefaultVariantTypeLabel(featureFlag.default_variant.type, t)}
            </StatBadgeValue>
          ),
          helper:
            defaultDistributionTotal !== null
              ? t(
                  'Pages.FeatureFlags.Detail.stats.defaultStrategy.helperDistribution',
                  {
                    count: defaultDistributionTotal,
                  },
                )
              : t(
                  'Pages.FeatureFlags.Detail.stats.defaultStrategy.helperSingle',
                ),
          Icon: Percent,
        },
      ]}
    />
  );
}
