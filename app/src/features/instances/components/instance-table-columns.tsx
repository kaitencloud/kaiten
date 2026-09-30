import type { TFunction } from 'i18next';
import type { GetInstancesWithRelationsQuery } from '@/api-client/graphql/graphql';
import { IntegrationSyncBadge } from '@/domains/crm-sync';
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
import {
  InstanceLifecycleStageBadge,
  InstanceStatusBadge,
} from '@/domains/customer-management';
import { InstanceTableActions } from './instance-table-actions';

export type InstanceRow =
  GetInstancesWithRelationsQuery['instances']['items'][number];

export const instanceMetadataAccessor = (
  instance: InstanceRow,
): Record<string, unknown> | null | undefined =>
  instance.metadata as Record<string, unknown> | null | undefined;

// Orphan keys = values present on the resource that no *active* field covers
// (archived schemas + never-declared keys). Used both to decide whether the
// "Extra metadata" column is worth showing and to fill its cell.
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
): ColumnDef<InstanceRow> => ({
  id: 'metadata.extra',
  enableSorting: false,
  header: t(
    'Pages.Customers.Instances.Table.Columns.extraMetadata',
    'Extra metadata',
  ),
  cell: ({ row }) => {
    const metadata = instanceMetadataAccessor(row.original);
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
        title={t(
          'Pages.Customers.Instances.Table.Dialogs.extraMetadataTitle',
          'Extra metadata',
        )}
        description={t(
          'Pages.Customers.Instances.Table.Dialogs.extraMetadataDescription',
          'Values reported on this instance that are not covered by an active metadata field schema.',
        )}
        triggerAriaLabel={t(
          'Pages.Customers.Instances.Table.Dialogs.extraMetadataTrigger',
          'Open extra metadata',
        )}
        value={extras}
      />
    );
  },
});

export const createColumns = (
  t: TFunction,
  /**
   * Active MetadataField descriptors for INSTANCE. When non-empty, the
   * single raw-JSON `metadata` column is replaced by one typed column
   * per descriptor + an "Extra metadata" column that exposes orphan
   * keys (archived schemas + values reported by the instance API that
   * never had a typed declaration). Empty list keeps the pre-schema
   * behaviour.
   */
  metadataFields: MetadataFieldDescriptor[],
  // Whether any row carries orphan metadata. When false the "Extra metadata"
  // column is omitted entirely — a well-configured table shouldn't surface it.
  showExtraMetadata: boolean,
): ColumnDef<InstanceRow>[] => {
  const baseColumns: ColumnDef<InstanceRow>[] = [
    {
      accessorKey: 'name',
      header: dataTableSortableHeader(
        t('Pages.Customers.Instances.Table.Columns.name', 'Name'),
      ),
      cell: ({ row }) => row.original.name,
    },
    {
      id: 'customer',
      accessorFn: (row) => row.customer.name,
      header: dataTableSortableHeader(
        t('Pages.Customers.Instances.Table.Columns.customer', 'Customer'),
      ),
      cell: ({ row }) => row.original.customer.name,
    },
    {
      id: 'crmSync',
      enableSorting: false,
      header: t('Pages.Customers.Instances.Table.Columns.crmSync', 'CRM Sync'),
      cell: ({ row }) => (
        <IntegrationSyncBadge
          entityKind="instance"
          entitySlug={row.original.slug}
          integrations={row.original.integrations}
        />
      ),
    },
    {
      id: 'license',
      accessorFn: (row) => row.license.name,
      header: dataTableSortableHeader(
        t('Pages.Customers.Instances.Table.Columns.license', 'License'),
      ),
      cell: ({ row }) => row.original.license.name,
    },
    {
      accessorKey: 'status',
      header: dataTableSortableHeader(
        t('Pages.Customers.Instances.Table.Columns.status', 'Status'),
      ),
      cell: ({ row }) => <InstanceStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'lifecycleStage',
      header: dataTableSortableHeader(
        t(
          'Pages.Customers.Instances.Table.Columns.lifecycleStage',
          'Lifecycle',
        ),
      ),
      cell: ({ row }) => (
        <InstanceLifecycleStageBadge stage={row.original.lifecycleStage} />
      ),
    },
  ];

  if (metadataFields.length === 0) {
    // Backward-compat: no schema declared → keep the raw-JSON dialog as
    // the single metadata surface.
    baseColumns.push({
      accessorKey: 'metadata',
      enableSorting: false,
      header: t('Pages.Customers.Instances.Table.Columns.metadata', 'Metadata'),
      cell: ({ row }) => (
        <TableJsonDialog
          title={t('Pages.Customers.Instances.Table.Dialogs.metadataTitle')}
          description={t(
            'Pages.Customers.Instances.Table.Dialogs.metadataDescription',
          )}
          triggerAriaLabel={t(
            'Pages.Customers.Instances.Table.Dialogs.metadataTrigger',
          )}
          value={instanceMetadataAccessor(row.original)}
        />
      ),
    });
  } else {
    // Typed dynamic columns plus the orphan-keys dialog. The
    // "Extra metadata" column is only added when a row actually carries
    // orphan keys — a fully-declared schema keeps the table clean.
    baseColumns.push(
      ...buildColumnsFromSchema<InstanceRow>(
        metadataFields,
        instanceMetadataAccessor,
      ),
    );
    if (showExtraMetadata) {
      baseColumns.push(buildExtraMetadataColumn(t, metadataFields));
    }
  }

  baseColumns.push(
    createActionsColumn<InstanceRow>((instance: InstanceRow) => (
      <InstanceTableActions instance={instance} />
    )),
  );

  return baseColumns;
};
