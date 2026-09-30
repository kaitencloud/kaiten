import { Calendar, CheckCircle, Clock, History, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getReleaseOverviewStats } from '@/domains/release-management';
import { StatsCardsRow } from '@/functionals/stats-cards-row';
import type { ReleaseManagementOverviewRelease } from '../../../types';

export function ReleaseOverviewStatsCards({
  releases,
}: {
  releases: ReleaseManagementOverviewRelease[];
}) {
  const { t } = useTranslation();
  const stats = getReleaseOverviewStats(releases);

  return (
    <StatsCardsRow
      // Total and one card per status: the four add up to the first.
      columnsClassName="md:grid-cols-3 xl:grid-cols-5"
      items={[
        {
          id: 'total-releases',
          label: t('Features.Releases.Stats.totalReleases'),
          value: stats.total,
          Icon: Package,
        },
        {
          id: 'deployed',
          label: t('Features.Releases.Stats.deployed'),
          value: stats.deployed,
          Icon: CheckCircle,
          iconClassName: 'text-success-subtle-foreground',
          valueClassName: 'text-success-subtle-foreground',
        },
        {
          id: 'staging',
          label: t('Features.Releases.Stats.inStaging'),
          value: stats.staging,
          Icon: Clock,
          iconClassName: 'text-secondary-foreground',
        },
        {
          id: 'superseded',
          label: t('Features.Releases.Stats.superseded'),
          value: stats.superseded,
          Icon: History,
        },
        {
          id: 'planned',
          label: t('Features.Releases.Stats.planned'),
          value: stats.planned,
          Icon: Calendar,
        },
      ]}
    />
  );
}
