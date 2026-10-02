import { useSuspenseQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import { ReleaseManagementPageShell } from '@/domains/release-management';
import { ReleaseOverviewStatsCards, ReleaseTable } from './release-overview';

type DeploymentsPageContentProps = {
  children?: ReactNode;
};

export function DeploymentsPageContent({
  children,
}: DeploymentsPageContentProps) {
  const { t } = useTranslation();
  // The overview, like /releases: only it holds the zones a release ever
  // reached, which is what tells a superseded release from a planned one.
  const { data: releases } = useSuspenseQuery(
    releaseManagementOverviewQueryOptions,
  );

  return (
    <ReleaseManagementPageShell
      iconKey="release"
      title={t('Pages.Releases.Deployments.title')}
      subtitle={t('Pages.Releases.Deployments.subtitle')}
      stats={<ReleaseOverviewStatsCards releases={releases ?? []} />}
      content={<ReleaseTable releases={releases ?? []} />}
    >
      {children}
    </ReleaseManagementPageShell>
  );
}
