import { GitBranch, Rocket, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatsCardsRow } from '@/functionals/stats-cards-row';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { ComponentCatalogStats } from '../types';

export function ComponentsStatsCards({
  stats,
}: {
  stats: ComponentCatalogStats;
}) {
  const { t } = useTranslation();
  const ComponentIcon = dataModelIcons.component;

  return (
    <StatsCardsRow
      items={[
        {
          id: 'total-components',
          label: t('Pages.Releases.Components.Stats.totalComponents'),
          value: stats.totalComponents,
          Icon: ComponentIcon,
        },
        {
          id: 'releases-using-components',
          label: t('Pages.Releases.Components.Stats.releasesUsingComponents'),
          value: stats.releasesUsingComponents,
          Icon: Rocket,
        },
        {
          id: 'shared-across-releases',
          label: t('Pages.Releases.Components.Stats.sharedAcrossReleases'),
          value: stats.sharedAcrossReleases,
          Icon: Share2,
        },
        {
          id: 'versioned-components',
          label: t('Pages.Releases.Components.Stats.versionedComponents'),
          value: stats.versionedComponents,
          Icon: GitBranch,
        },
      ]}
    />
  );
}
