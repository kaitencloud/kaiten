import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeploymentZone, Release } from '@/api-client';
import { GradientButton } from '@/components/gradient-button';
import type {
  DeploymentZoneRelations,
  ReleaseManagementOverviewRelease,
} from '@/domains/release-management';
import { metadataFieldsActiveQueryOptions } from '@/domains/metadata-fields';
import { useFilterBuilder } from '@/functionals/filters';
import type { MetadataFieldDescriptor } from '@/functionals/metadata-fields';
import { DataTable, FilterTableLayout } from '@/functionals/table';
import {
  createColumns,
  extraMetadataKeys,
  zoneMetadataAccessor,
} from './deployment-zone-table-columns';
import { createDeploymentZoneFilterFields } from './deployment-zone-table-filters';

type DeploymentZoneTableProps = {
  deploymentZones: DeploymentZone[];
  releaseById: Map<string, ReleaseManagementOverviewRelease>;
  releases: Release[];
  relationsByZoneId: Map<string, DeploymentZoneRelations>;
  onEdit: (zone: DeploymentZone) => void;
  onDeploy: (zone: DeploymentZone) => void;
  onClickNew?: () => void;
};

export function DeploymentZoneTable({
  deploymentZones,
  releaseById,
  releases,
  relationsByZoneId,
  onEdit,
  onDeploy,
  onClickNew,
}: DeploymentZoneTableProps) {
  const { t } = useTranslation();
  const router = useRouter();
  // Soft-fetch the active MetadataField list. We do NOT block on suspense:
  // a missing or 403'd response is treated as "no schema declared" so the
  // table degrades to its pre-schema raw-JSON view rather than breaking
  // the page entirely.
  const { data: metadataFieldsData } = useQuery(
    metadataFieldsActiveQueryOptions('DEPLOYMENT_ZONE'),
  );
  const metadataFields = useMemo<MetadataFieldDescriptor[]>(
    () => metadataFieldsData ?? [],
    [metadataFieldsData],
  );
  // Only surface the "Extra metadata" column when at least one zone carries
  // metadata not covered by an active field — i.e. a sign the schema is
  // incomplete. A fully-declared table stays clean.
  const showExtraMetadata = useMemo(
    () =>
      deploymentZones.some(
        (zone) =>
          extraMetadataKeys(zoneMetadataAccessor(zone), metadataFields).length >
          0,
      ),
    [deploymentZones, metadataFields],
  );
  const columns = useMemo(
    () =>
      createColumns(
        t,
        relationsByZoneId,
        releaseById,
        releases,
        onEdit,
        onDeploy,
        metadataFields,
        showExtraMetadata,
      ),
    [
      t,
      relationsByZoneId,
      releaseById,
      releases,
      onEdit,
      onDeploy,
      metadataFields,
      showExtraMetadata,
    ],
  );
  const filterFields = useMemo(
    () =>
      createDeploymentZoneFilterFields(
        deploymentZones,
        releases,
        t,
        metadataFields,
      ),
    [deploymentZones, releases, t, metadataFields],
  );
  const filterController = useFilterBuilder({
    data: deploymentZones,
    fields: filterFields,
    pinnedFilterIds: ['name'],
    debounceMs: 200,
    resetOnDataChange: true,
  });

  const getZonePath = (zone: DeploymentZone) =>
    zone.slug
      ? router.buildLocation({
          to: '/releases/deployment-zones/$zoneSlug',
          params: { zoneSlug: zone.slug },
        }).pathname
      : undefined;

  return (
    <FilterTableLayout controller={filterController}>
      <FilterTableLayout.Toolbar>
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search filterId="name" />
          {onClickNew ? (
            <FilterTableLayout.Actions>
              <GradientButton
                onClick={onClickNew}
                label={t('Features.Releases.Form.createZone')}
              />
            </FilterTableLayout.Actions>
          ) : null}
        </FilterTableLayout.ToolbarRow>
        <FilterTableLayout.Filters />
      </FilterTableLayout.Toolbar>

      <FilterTableLayout.Content>
        <DataTable
          className="h-full"
          columns={columns}
          data={filterController.filteredData}
          getPath={getZonePath}
          bodyScrollable
        />
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
}
