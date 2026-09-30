import { Badge } from '@/components/ui/badge';
import { useRouter } from '@tanstack/react-router';
import { Tag } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GradientButton } from '@/components/gradient-button';
import {
  formatReleaseStatus,
  getCurrentDeploymentZones,
  getReleaseOverviewStatus,
  getReleaseStatusBadgeVariant,
  RELEASE_STATUSES,
} from '@/domains/release-management';
import {
  type FilterFieldDefinition,
  useFilterBuilder,
} from '@/functionals/filters';
import {
  type ColumnDef,
  DataTable,
  dataTableSortableHeader,
  FilterTableLayout,
} from '@/functionals/table';
import { formatDate } from '@/lib/detail';
import type { ReleaseManagementOverviewRelease } from '../../../types';
import { ReleaseComponentsDisplay } from '../displays/release-components-display';
import { ReleaseInstancesDisplay } from '../displays/release-instances-display';
import {
  type LinkedDeploymentZone,
  ReleaseLinkedDeploymentZonesDisplay,
} from '../displays/release-linked-deployment-zones-display';

const createColumns = (
  t: any,
  locale: string,
): ColumnDef<ReleaseManagementOverviewRelease>[] => [
  {
    accessorKey: 'version',
    enableSorting: false,
    header: t('Features.Releases.Table.Columns.version'),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Tag className="size-4 text-primary-subtle-foreground" />
        <span className="font-medium">{row.original.version}</span>
      </div>
    ),
  },
  {
    id: 'status',
    enableSorting: false,
    header: t('Features.Releases.Table.Columns.status'),
    cell: ({ row }) => {
      const status = getReleaseOverviewStatus(row.original);
      return (
        <Badge variant={getReleaseStatusBadgeVariant(status)}>
          {formatReleaseStatus(status, t)}
        </Badge>
      );
    },
  },
  {
    id: 'components',
    enableSorting: false,
    header: t('Pages.Releases.Releases.Table.Columns.components'),
    cell: ({ row }) => (
      <ReleaseComponentsDisplay components={row.original.components ?? []} />
    ),
  },
  {
    id: 'deploymentZones',
    enableSorting: false,
    header: t('Features.Releases.Table.Columns.deploymentZones'),
    cell: ({ row }) => (
      <ReleaseLinkedDeploymentZonesDisplay
        // Where it runs now. release.deploymentZones is every zone it EVER ran
        // on; see getCurrentDeploymentZones.
        deploymentZones={
          getCurrentDeploymentZones(row.original) as LinkedDeploymentZone[]
        }
        emptyLabel={t('Features.Releases.Table.notDeployed')}
      />
    ),
  },
  {
    id: 'instances',
    enableSorting: false,
    header: t('Pages.Releases.Releases.Table.Columns.instances'),
    cell: ({ row }) => (
      <ReleaseInstancesDisplay
        deploymentZoneNameById={
          new Map(
            (row.original.deploymentZones ?? []).map((zone) => [
              zone.id,
              zone.name,
            ]),
          )
        }
        // Same history-versus-state split as the zones column: release.instances
        // spans every zone the release ever reached, so keep only the instances
        // in a zone that still runs it.
        instances={(row.original.instances ?? []).filter((instance) =>
          getCurrentDeploymentZones(row.original).some(
            (zone) => zone.id === instance.deploymentZoneId,
          ),
        )}
      />
    ),
  },
  {
    accessorKey: 'createdAt',
    header: dataTableSortableHeader(
      t('Features.Releases.Table.Columns.createdAt'),
    ),
    cell: ({ row }) => (
      <span className="text-sm">
        {formatDate(row.original.createdAt, locale)}
      </span>
    ),
  },
  {
    accessorKey: 'description',
    enableSorting: false,
    header: t('Features.Releases.Table.Columns.description'),
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.description || '-'}
      </span>
    ),
  },
];

export function ReleaseOverviewTable({
  onClickNew,
  releases,
}: {
  onClickNew?: () => void;
  releases: ReleaseManagementOverviewRelease[];
}) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const router = useRouter();
  const columns = useMemo(() => createColumns(t, locale), [locale, t]);
  const statusOptions = useMemo(
    () =>
      RELEASE_STATUSES.map((status) => ({
        label: formatReleaseStatus(status, t),
        value: status,
      })),
    [t],
  );
  const deploymentZoneOptions = useMemo(() => {
    return [
      ...new Set(
        releases.flatMap((release) =>
          getCurrentDeploymentZones(release).map((zone) => zone.name),
        ),
      ),
    ]
      .sort()
      .map((zoneName) => ({
        label: zoneName,
        value: zoneName,
      }));
  }, [releases]);

  const filterFields = useMemo<
    FilterFieldDefinition<ReleaseManagementOverviewRelease>[]
  >(
    () => [
      {
        id: 'version',
        label: t('Features.Releases.Table.Columns.version', 'Version'),
        type: 'text',
        accessor: (release) => release.version,
        placeholder: t('Features.Releases.Table.Columns.version', 'Version'),
      },
      {
        id: 'status',
        label: t('Features.Releases.Table.Columns.status', 'Status'),
        type: 'enum',
        accessor: (release) => getReleaseOverviewStatus(release),
        options: statusOptions,
      },
      {
        id: 'deploymentZone',
        label: t(
          'Features.Releases.Table.Columns.deploymentZones',
          'Deployment zones',
        ),
        type: 'enum',
        accessor: (release) =>
          getCurrentDeploymentZones(release).map((zone) => zone.name),
        options: deploymentZoneOptions,
      },
      {
        id: 'createdAt',
        label: t('Features.Releases.Table.Columns.createdAt', 'Created at'),
        type: 'date',
        accessor: (release) => release.createdAt,
      },
    ],
    [deploymentZoneOptions, statusOptions, t],
  );

  const filterController = useFilterBuilder({
    data: releases,
    fields: filterFields,
    pinnedFilterIds: ['version'],
    debounceMs: 200,
    resetOnDataChange: true,
  });

  const getReleasePath = (release: ReleaseManagementOverviewRelease) =>
    release.slug
      ? router.buildLocation({
          to: '/releases/$releaseSlug',
          params: { releaseSlug: release.slug },
        }).pathname
      : undefined;

  return (
    <FilterTableLayout controller={filterController}>
      <FilterTableLayout.Toolbar>
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search filterId="version" />
          {onClickNew ? (
            <FilterTableLayout.Actions>
              <GradientButton
                onClick={onClickNew}
                label={t('Features.Releases.Form.createRelease')}
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
          getPath={getReleasePath}
          linkColumnId="version"
          bodyScrollable
          // With releases hidden by a filter, the default "No results" is right.
          emptyMessage={
            releases.length === 0
              ? t('Pages.Releases.Releases.Table.empty')
              : undefined
          }
        />
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
}
