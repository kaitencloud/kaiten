import { EntityIcon } from '@/components/ui/icon';
import type { TFunction } from 'i18next';
import type { Entitlement } from '@/api-client';
import {
  type ColumnDef,
  createActionsColumn,
  dataTableSortableHeader,
} from '@/functionals/table';
import { AggregationMethodDisplay } from '../display/aggregation-method-display';
import { EntitlementGroupsInlineEditorCell } from '../groups/entitlement-groups-inline-editor-cell';
import { EntitlementTableActions } from './entitlement-table-actions';
import { EntitlementTypeDisplay } from '../display/entitlement-type-display';

export function createEntitlementTableColumns(
  t: TFunction,
  onDeleteRefused: (error: unknown, entitlementSlug?: string) => boolean,
): ColumnDef<Entitlement>[] {
  return [
    {
      accessorKey: 'name',
      header: dataTableSortableHeader(
        t('Pages.Entitlements.Table.Columns.name', 'Name'),
      ),
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <EntityIcon
            token={row.original.icon}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span>{row.original.name}</span>
        </span>
      ),
    },
    {
      accessorKey: 'description',
      enableSorting: false,
      header: t('Pages.Entitlements.Table.Columns.description', 'Description'),
    },
    {
      id: 'entitlementGroups',
      enableSorting: false,
      header: t('Pages.Entitlements.Table.Columns.groups', 'Groups'),
      cell: ({ row }) => (
        <EntitlementGroupsInlineEditorCell entitlement={row.original} />
      ),
    },
    {
      accessorKey: 'type',
      enableSorting: false,
      header: t('Pages.Entitlements.Table.Columns.type', 'Type'),
      cell: ({ row }) => (
        <EntitlementTypeDisplay
          entitlementType={row.original.type ?? 'BOOLEAN'}
        />
      ),
    },
    {
      accessorKey: 'aggregationMethod',
      enableSorting: false,
      header: t(
        'Pages.Entitlements.Table.Columns.aggregationMethod',
        'Aggregation Method',
      ),
      cell: ({ row }) => (
        <AggregationMethodDisplay
          aggregationMethod={row.original.aggregationMethod}
        />
      ),
    },
    createActionsColumn<Entitlement>((entitlement: Entitlement) => (
      <EntitlementTableActions
        entitlement={entitlement}
        onDeleteRefused={onDeleteRefused}
      />
    )),
  ];
}
