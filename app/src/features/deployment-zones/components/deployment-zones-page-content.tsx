import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { DatabaseZap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { allReleasesOptions } from '@/lib/api/all-pages-query-options';
import {
  buildDeploymentZoneRelations,
  releaseManagementOverviewQueryOptions,
} from '@/domains/release-management';
import { ReleaseManagementPageShell } from '@/domains/release-management';
import { deploymentZonesQueryOptions } from '../queries';
import type { DeploymentZone } from '../types';
import { DeploymentZoneStatsCards } from './deployment-zones/deployment-zone-stats-cards';
import { DeploymentZoneTable } from './deployment-zones/deployment-zone-table';

type DeploymentZonesPageContentProps = {
  children?: ReactNode;
};

export function DeploymentZonesPageContent({
  children,
}: DeploymentZonesPageContentProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: releases } = useSuspenseQuery(allReleasesOptions());
  const { data: deploymentZones } = useSuspenseQuery(
    deploymentZonesQueryOptions,
  );
  const { data: releaseOverview } = useSuspenseQuery(
    releaseManagementOverviewQueryOptions,
  );
  const relationsByZoneId = buildDeploymentZoneRelations(releaseOverview ?? []);
  const releaseById = new Map(
    (releaseOverview ?? []).map((release) => [release.id, release]),
  );
  const totalInstances = new Set(
    [...relationsByZoneId.values()].flatMap((relations) =>
      relations.instances.map((instance) => instance.id),
    ),
  ).size;
  const totalDeployments = new Set(
    [...relationsByZoneId.entries()].flatMap(([zoneId, relations]) =>
      relations.releases.map((release) => `${release.id}:${zoneId}`),
    ),
  ).size;

  const handleEditZone = (zone: DeploymentZone) => {
    navigate({
      to: '/releases/deployment-zones/$zoneSlug/edit',
      params: { zoneSlug: zone.slug! },
    });
  };

  const handleDeployRelease = (zone: DeploymentZone) => {
    navigate({
      to: '/releases/deployment-zones/$zoneSlug/deploy',
      params: { zoneSlug: zone.slug! },
    });
  };

  return (
    <ReleaseManagementPageShell
      iconKey="deploymentZone"
      title={t('Pages.Releases.DeploymentZones.title')}
      subtitle={t('Pages.Releases.DeploymentZones.subtitle')}
      actions={
        <Button
          variant="outline"
          nativeButton={false}
          role="link"
          render={
            <Link
              to="/settings/metadata"
              search={{ resourceType: 'DEPLOYMENT_ZONE' }}
            >
              <DatabaseZap className="size-4" />
              {t(
                'Pages.Settings.Metadata.configureFieldsButton',
                'Configure metadata fields',
              )}
            </Link>
          }
        />
      }
      stats={
        <DeploymentZoneStatsCards
          deploymentZones={deploymentZones?.items ?? []}
          totalDeployments={totalDeployments}
          totalInstances={totalInstances}
        />
      }
      content={
        <DeploymentZoneTable
          deploymentZones={deploymentZones?.items ?? []}
          releaseById={releaseById}
          releases={releases?.items ?? []}
          relationsByZoneId={relationsByZoneId}
          onEdit={handleEditZone}
          onDeploy={handleDeployRelease}
          onClickNew={() => navigate({ to: '/releases/deployment-zones/new' })}
        />
      }
    >
      {children}
    </ReleaseManagementPageShell>
  );
}
