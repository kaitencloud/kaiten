import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import { ReleaseManagementPageShell } from '@/functionals/release-management';
import { componentsQueryOptions } from '../queries';
import {
  buildComponentCatalogRows,
  getComponentCatalogStats,
  groupComponentCatalogRows,
} from '../utils/components-catalog';
import { ComponentsStatsCards } from './components-stats-cards';
import { ComponentsTable } from './components-table';

type ComponentsPageContentProps = {
  children?: ReactNode;
};

export function ComponentsPageContent({
  children,
}: ComponentsPageContentProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: components } = useSuspenseQuery(componentsQueryOptions);
  const { data: releases } = useSuspenseQuery(
    releaseManagementOverviewQueryOptions,
  );

  // Rebuilt only when a query returns new data: a new array would reset the
  // table's filters and send it back to its first page.
  const componentRows = useMemo(
    () => buildComponentCatalogRows(components?.items ?? [], releases ?? []),
    [components?.items, releases],
  );
  const stats = useMemo(
    () => getComponentCatalogStats(groupComponentCatalogRows(componentRows)),
    [componentRows],
  );

  return (
    <ReleaseManagementPageShell
      iconKey="component"
      title={t('Pages.Releases.Components.title')}
      subtitle={t('Pages.Releases.Components.subtitle')}
      stats={<ComponentsStatsCards stats={stats} />}
      content={
        <ComponentsTable
          components={componentRows}
          onClickNew={() => navigate({ to: '/releases/components/new' })}
        />
      }
    >
      {children}
    </ReleaseManagementPageShell>
  );
}
