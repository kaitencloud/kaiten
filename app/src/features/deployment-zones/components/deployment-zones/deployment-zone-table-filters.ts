import type { TFunction } from 'i18next';
import type { DeploymentZone, Release } from '@/api-client';
import type { FilterFieldDefinition } from '@/functionals/filters';
import {
  buildFiltersFromSchema,
  type MetadataFieldDescriptor,
} from '@/functionals/metadata-fields';
import { formatZoneType } from '../../utils/deployment-zone-helpers';

type FilterOption = {
  label: string;
  value: string;
};

export const NOT_DEPLOYED_VALUE = '__not_deployed__';

function buildReleaseVersionById(releases: Release[]) {
  return new Map(releases.map((release) => [release.id, release.version]));
}

function buildTypeOptions(
  deploymentZones: DeploymentZone[],
  t: TFunction,
): FilterOption[] {
  return [...new Set(deploymentZones.map((zone) => zone.type))]
    .sort()
    .map((type) => ({
      label: formatZoneType(type, t),
      value: type,
    }));
}

function buildReleaseOptions(releases: Release[]): FilterOption[] {
  return [...new Set(releases.map((release) => release.version))]
    .sort()
    .map((version) => ({
      label: version,
      value: version,
    }));
}

const zoneMetadataAccessor = (
  zone: DeploymentZone,
): Record<string, unknown> | null | undefined =>
  zone.metadata as Record<string, unknown> | null | undefined;

export function createDeploymentZoneFilterFields(
  deploymentZones: DeploymentZone[],
  releases: Release[],
  t: TFunction,
  /**
   * Active MetadataField descriptors for DEPLOYMENT_ZONE. When empty, the
   * table keeps its pre-schema behavior: a single `hasMetadata` boolean
   * filter over the jsonb blob. When non-empty, one typed filter is
   * generated per descriptor — replacing the boolean since the per-field
   * filters cover the same ground more precisely. Callers should pass
   * `partitionFields(rows).active`; archived rows would produce filters
   * for keys nobody can write anymore.
   */
  metadataFields: MetadataFieldDescriptor[] = [],
): FilterFieldDefinition<DeploymentZone>[] {
  const releaseVersionById = buildReleaseVersionById(releases);
  const releaseOptions = buildReleaseOptions(releases);
  const typeOptions = buildTypeOptions(deploymentZones, t);

  const filters: FilterFieldDefinition<DeploymentZone>[] = [
    {
      id: 'name',
      label: t('Features.Releases.Table.Columns.name', 'Name'),
      type: 'text',
      accessor: (zone) => zone.name,
      placeholder: t('Features.Releases.Table.Columns.name', 'Name'),
    },
    {
      id: 'type',
      label: t('Features.Releases.Table.Columns.type', 'Type'),
      type: 'enum',
      accessor: (zone) => zone.type,
      options: typeOptions,
    },
    {
      id: 'currentRelease',
      label: t(
        'Features.Releases.Table.Columns.currentRelease',
        'Current release',
      ),
      type: 'enum',
      accessor: (zone) =>
        releaseVersionById.get(zone.releaseId ?? '') ?? NOT_DEPLOYED_VALUE,
      options: [
        {
          label: t('Features.Releases.Table.notDeployed'),
          value: NOT_DEPLOYED_VALUE,
        },
        ...releaseOptions,
      ],
    },
  ];

  if (metadataFields.length === 0) {
    filters.push({
      id: 'hasMetadata',
      label: t('Features.Releases.Table.Columns.metadata', 'Metadata'),
      type: 'boolean',
      accessor: (zone) =>
        Boolean(zone.metadata && Object.keys(zone.metadata).length > 0),
    });
  } else {
    filters.push(
      ...buildFiltersFromSchema<DeploymentZone>(
        metadataFields,
        zoneMetadataAccessor,
      ),
    );
  }

  filters.push({
    id: 'updatedAt',
    label: t('Features.Releases.Table.Columns.updatedAt', 'Updated at'),
    type: 'date',
    accessor: (zone) => zone.updatedAt,
  });

  return filters;
}
