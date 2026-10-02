import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import { ReleaseManagementPageShell } from '@/domains/release-management';
import { ReleaseOverviewStatsCards } from './release-overview';
import { ReleaseOverviewTable } from './release-overview/tables/release-overview-table';

export function ReleasesPageContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: releases } = useSuspenseQuery(
    releaseManagementOverviewQueryOptions,
  );

  return (
    <ReleaseManagementPageShell
      iconKey="release"
      title={t('Pages.Releases.Releases.title')}
      subtitle={t('Pages.Releases.Releases.subtitle')}
      stats={<ReleaseOverviewStatsCards releases={releases ?? []} />}
      content={
        <ReleaseOverviewTable
          releases={releases ?? []}
          onClickNew={() => navigate({ to: '/releases/new' })}
        />
      }
    />
  );
}
