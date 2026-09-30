import { Badge } from '@/components/ui/badge';
import type { TFunction } from 'i18next';
import type { DeploymentZone, Release } from '@/api-client';
import type {
  DeploymentZoneRelations,
  ReleaseManagementOverviewRelease,
} from '@/domains/release-management';
import {
  buildColumnsFromSchema,
  type MetadataFieldDescriptor,
  partitionMetadata,
} from '@/functionals/metadata-fields';
import {
  type ColumnDef,
  createActionsColumn,
  dataTableSortableHeader,
  TableJsonDialog,
} from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import {
  formatDate,
  formatZoneType,
  getZoneTypeBadgeVariant,
} from '../../utils/deployment-zone-helpers';
import { DeploymentZoneInstancesDisplay } from './deployment-zone-instances-display';
import { DeploymentZoneReleasesDisplay } from './deployment-zone-releases-display';
import { DeploymentZoneTableActions } from './deployment-zone-table-actions';

export const zoneMetadataAccessor = (
  zone: DeploymentZone,
): Record<string, unknown> | null | undefined =>
  zone.metadata as Record<string, unknown> | null | undefined;

// Orphan keys = values on the zone that no *active* field covers (archived
// schemas + never-declared keys). Drives both the decision to show the
// "Extra metadata" column and the content of its cell.
export const extraMetadataKeys = (
  metadata: Record<string, unknown> | null | undefined,
  metadataFields: MetadataFieldDescriptor[],
): string[] => {
  const { archivedLeftovers, unknown } = partitionMetadata(
    metadata,
    metadataFields,
  );
  return [...Object.keys(archivedLeftovers), ...Object.keys(unknown)];
};

const buildExtraMetadataColumn = (
  t: TFunction,
  metadataFields: MetadataFieldDescriptor[],
): ColumnDef<DeploymentZone> => ({
  id: 'metadata.extra',
  enableSorting: false,
  header: t('Features.Releases.Table.Columns.extraMetadata', 'Extra metadata'),
  cell: ({ row }) => {
    const metadata = zoneMetadataAccessor(row.original);
    const { archivedLeftovers, unknown } = partitionMetadata(
      metadata,
      metadataFields,
    );
    // The column is only mounted when at least one row has extras, but a
    // given row may still be clean — show a dash there.
    const extras = { ...archivedLeftovers, ...unknown };
    if (Object.keys(extras).length === 0) {
      return <span className="text-muted-foreground text-xs">—</span>;
    }
    return (
      <TableJsonDialog
        title={t('Features.Releases.ExtraMetadata.title', 'Extra metadata')}
        description={t(
          'Features.Releases.ExtraMetadata.description',
          'Values stored on this zone that are not covered by an active metadata field schema.',
        )}
        triggerAriaLabel={t(
          'Features.Releases.ExtraMetadata.title',
          'Extra metadata',
        )}
        value={extras}
      />
    );
  },
});

export const createColumns = (
  t: TFunction,
  relationsByZoneId: Map<string, DeploymentZoneRelations>,
  releaseById: Map<string, ReleaseManagementOverviewRelease>,
  releases: Release[],
  onEdit: (zone: DeploymentZone) => void,
  onDeploy: (zone: DeploymentZone) => void,
  /**
   * Active MetadataField descriptors for DEPLOYMENT_ZONE. When non-empty,
   * the static "metadata" raw-JSON column is replaced by one typed column
   * per descriptor + an "Extra metadata" column that surfaces orphan keys
   * (values stored on the zone whose key is neither active nor archived).
   * Empty list keeps the pre-schema behavior.
   */
  metadataFields: MetadataFieldDescriptor[],
  // Whether any zone carries orphan metadata. When false the "Extra metadata"
  // column is omitted entirely — a well-configured table shouldn't surface it.
  showExtraMetadata: boolean,
): ColumnDef<DeploymentZone>[] => {
  const baseColumns: ColumnDef<DeploymentZone>[] = [
    {
      accessorKey: 'name',
      header: dataTableSortableHeader(
        t('Features.Releases.Table.Columns.name'),
      ),
      cell: ({ row }) => {
        const DeploymentZoneIcon = dataModelIcons.deploymentZone;

        return (
          <div className="flex items-center gap-2">
            <DeploymentZoneIcon className="size-4 text-primary-subtle-foreground" />
            <span className="font-medium">{row.original.name}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'type',
      enableSorting: false,
      header: t('Features.Releases.Table.Columns.type'),
      cell: ({ row }) => (
        <Badge variant={getZoneTypeBadgeVariant(row.original.type)}>
          {formatZoneType(row.original.type, t)}
        </Badge>
      ),
    },
  ];

  if (metadataFields.length === 0) {
    // Backward-compat: no schema declared → keep the raw-JSON dialog as
    // the single metadata surface.
    baseColumns.push({
      accessorKey: 'metadata',
      enableSorting: false,
      header: t('Features.Releases.Table.Columns.metadata'),
      cell: ({ row }) => (
        <TableJsonDialog
          title={t('Features.Releases.Metadata.title')}
          description={t('Features.Releases.Metadata.description')}
          triggerAriaLabel={t('Features.Releases.Metadata.title')}
          value={zoneMetadataAccessor(row.original)}
        />
      ),
    });
  } else {
    // Typed dynamic columns plus the orphan-keys dialog. The
    // "Extra metadata" column is only added when a zone actually carries
    // orphan keys — a fully-declared schema keeps the table clean.
    baseColumns.push(
      ...buildColumnsFromSchema<DeploymentZone>(
        metadataFields,
        zoneMetadataAccessor,
      ),
    );
    if (showExtraMetadata) {
      baseColumns.push(buildExtraMetadataColumn(t, metadataFields));
    }
  }

  baseColumns.push(
    {
      accessorKey: 'releaseId',
      enableSorting: false,
      header: t('Features.Releases.Table.Columns.currentRelease'),
      cell: ({ row }) => {
        const release = releases.find((r) => r.id === row.original.releaseId);
        if (!release) {
          return (
            <span className="text-sm text-muted-foreground">
              {t('Features.Releases.Table.notDeployed')}
            </span>
          );
        }
        return <Badge variant="outline">{release.version}</Badge>;
      },
    },
    {
      id: 'releases',
      enableSorting: false,
      header: t('Pages.Releases.Components.Table.Columns.releases'),
      cell: ({ row }) => (
        <DeploymentZoneReleasesDisplay
          releaseById={releaseById}
          releases={relationsByZoneId.get(row.original.id)?.releases ?? []}
        />
      ),
    },
    {
      id: 'instances',
      enableSorting: false,
      header: t('Pages.Releases.Releases.Table.Columns.instances'),
      cell: ({ row }) => (
        <DeploymentZoneInstancesDisplay
          instances={relationsByZoneId.get(row.original.id)?.instances ?? []}
        />
      ),
    },
    {
      accessorKey: 'createdAt',
      header: dataTableSortableHeader(
        t('Features.Releases.Table.Columns.createdAt'),
      ),
      cell: ({ row }) => (
        <span className="text-sm">{formatDate(row.original.createdAt)}</span>
      ),
    },
    {
      accessorKey: 'updatedAt',
      header: dataTableSortableHeader(
        t('Features.Releases.Table.Columns.updatedAt'),
      ),
      cell: ({ row }) => {
        if (row.original.updatedAt === row.original.createdAt) {
          return <span className="text-sm text-muted-foreground">-</span>;
        }
        return (
          <span className="text-sm">{formatDate(row.original.updatedAt)}</span>
        );
      },
    },
    createActionsColumn<DeploymentZone>((zone) => (
      <DeploymentZoneTableActions
        deploymentZone={zone}
        releases={releases}
        onEdit={() => onEdit(zone)}
        onDeploy={() => onDeploy(zone)}
      />
    )),
  );

  return baseColumns;
};
