import { GitBranch, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatCard } from '@/functionals/stat-card';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { ComponentCatalogStats } from '../types';

export function ComponentsStatsCards({
  stats,
}: {
  stats: ComponentCatalogStats;
}) {
  const { t } = useTranslation();
  const ComponentIcon = dataModelIcons.component;
  const ReleaseIcon = dataModelIcons.release;

  return (
    <StatCard.Row>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Releases.Components.Stats.totalComponents')}
        </StatCard.Label>
        <StatCard.Icon>
          <ComponentIcon />
        </StatCard.Icon>
        <StatCard.Value>{stats.totalComponents}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Releases.Components.Stats.releasesUsingComponents')}
        </StatCard.Label>
        <StatCard.Icon>
          <ReleaseIcon />
        </StatCard.Icon>
        <StatCard.Value>{stats.releasesUsingComponents}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Releases.Components.Stats.sharedAcrossReleases')}
        </StatCard.Label>
        <StatCard.Icon>
          <Share2 />
        </StatCard.Icon>
        <StatCard.Value>{stats.sharedAcrossReleases}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Pages.Releases.Components.Stats.versionedComponents')}
        </StatCard.Label>
        <StatCard.Icon>
          <GitBranch />
        </StatCard.Icon>
        <StatCard.Value>{stats.versionedComponents}</StatCard.Value>
      </StatCard>
    </StatCard.Row>
  );
}
