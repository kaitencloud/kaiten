import { Calendar, CheckCircle, Clock, History, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getReleaseOverviewStats } from '@/domains/release-management';
import { StatCard } from '@/functionals/stat-card';
import type { ReleaseManagementOverviewRelease } from '../../../types';

export function ReleaseOverviewStatsCards({
  releases,
}: {
  releases: ReleaseManagementOverviewRelease[];
}) {
  const { t } = useTranslation();
  const stats = getReleaseOverviewStats(releases);

  return (
    // Total and one card per status: the four add up to the first.
    <StatCard.Row columnsClassName="md:grid-cols-3 xl:grid-cols-5">
      <StatCard>
        <StatCard.Label>
          {t('Features.Releases.Stats.totalReleases')}
        </StatCard.Label>
        <StatCard.Icon>
          <Package />
        </StatCard.Icon>
        <StatCard.Value>{stats.total}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>{t('Features.Releases.Stats.deployed')}</StatCard.Label>
        <StatCard.Icon className="text-success-subtle-foreground">
          <CheckCircle />
        </StatCard.Icon>
        <StatCard.Value className="text-success-subtle-foreground">
          {stats.deployed}
        </StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Features.Releases.Stats.inStaging')}
        </StatCard.Label>
        <StatCard.Icon className="text-secondary-foreground">
          <Clock />
        </StatCard.Icon>
        <StatCard.Value>{stats.staging}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Features.Releases.Stats.superseded')}
        </StatCard.Label>
        <StatCard.Icon>
          <History />
        </StatCard.Icon>
        <StatCard.Value>{stats.superseded}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>{t('Features.Releases.Stats.planned')}</StatCard.Label>
        <StatCard.Icon>
          <Calendar />
        </StatCard.Icon>
        <StatCard.Value>{stats.planned}</StatCard.Value>
      </StatCard>
    </StatCard.Row>
  );
}
