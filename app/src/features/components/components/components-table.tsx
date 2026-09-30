import { Badge } from '@/components/ui/badge';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GradientButton } from '@/components/gradient-button';
import { useFilterBuilder } from '@/functionals/filters';
import {
  type ColumnDef,
  DataTable,
  DataTableRowExpander,
  dataTableSortableHeader,
  FilterTableLayout,
  type Row,
} from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { formatDate, getAuditDisplayName } from '@/lib/detail';
import type { ComponentCatalogEntry, ComponentCatalogRow } from '../types';
import {
  getComponentCatalogEntryId,
  getComponentCatalogEntryVersions,
  groupComponentCatalogRows,
} from '../utils/components-catalog';
import { ComponentReleasesDisplay } from './component-releases-display';
import { createComponentCatalogFilterFields } from './components-table-filters';

type ComponentsTableProps = {
  /** Every version: the filters match versions, then the table groups them. */
  components: ComponentCatalogRow[];
  onClickNew?: () => void;
};

// A component's own row sits at the top level, its versions one level down.
const isVersionRow = (row: Row<ComponentCatalogEntry>) => row.depth > 0;

// Collapsed, a component's row reads as its latest version. Expanded, it heads
// its versions: it keeps what is the component's own -- name, version count,
// releases of every version -- and leaves the latest version's details to that
// version's row, right below, instead of showing them twice.
const isHeadingVersions = (row: Row<ComponentCatalogEntry>) =>
  !isVersionRow(row) && row.getIsExpanded();

const createColumns = (
  hasVersionedComponents: boolean,
  locale: string,
  t: TFunction,
): ColumnDef<ComponentCatalogEntry>[] => [
  {
    accessorKey: 'name',
    header: dataTableSortableHeader(
      t('Pages.Releases.Components.Table.Columns.name', 'Name'),
    ),
    cell: ({ row }) => {
      if (isVersionRow(row)) {
        // Lined up with its component's name, which it does not repeat.
        return (
          <div className="min-w-0 ps-14">
            <span className="sr-only">{row.original.name}</span>
            {row.original.description ? (
              <p className="text-muted-foreground truncate text-sm">
                {row.original.description}
              </p>
            ) : null}
          </div>
        );
      }

      const ComponentIcon = dataModelIcons.component;

      return (
        <div className="flex min-w-0 items-start gap-2">
          {hasVersionedComponents ? (
            <DataTableRowExpander
              row={row}
              label={t('Pages.Releases.Components.Table.versionsOf', {
                name: row.original.name,
              })}
            />
          ) : null}
          <ComponentIcon className="mt-0.5 size-4 shrink-0 text-primary-subtle-foreground" />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            {row.original.description && !isHeadingVersions(row) ? (
              <p className="text-muted-foreground mt-1 truncate text-sm">
                {row.original.description}
              </p>
            ) : null}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'version',
    enableSorting: false,
    header: t('Pages.Releases.Components.Table.Columns.version', 'Version'),
    cell: ({ row }) => {
      const versionCount = row.original.versions?.length ?? 1;

      return (
        <div className="flex flex-wrap items-center gap-2">
          {isHeadingVersions(row) ? null : (
            <Badge variant="outline" className="font-mono">
              {row.original.version}
            </Badge>
          )}
          {versionCount > 1 ? (
            <span className="text-muted-foreground text-sm">
              {t('Pages.Releases.Components.Table.versionCount', {
                count: versionCount,
              })}
            </span>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: 'releases',
    enableSorting: false,
    header: t('Pages.Releases.Components.Table.Columns.releases', 'Releases'),
    cell: ({ row }) => (
      <ComponentReleasesDisplay
        componentName={
          isVersionRow(row)
            ? `${row.original.name} ${row.original.version}`
            : row.original.name
        }
        releases={row.original.releases}
      />
    ),
  },
  {
    accessorKey: 'createdAt',
    header: dataTableSortableHeader(
      t('Pages.Releases.Components.Table.Columns.createdAt', 'Created'),
    ),
    cell: ({ row }) =>
      isHeadingVersions(row) ? null : (
        <span className="text-sm">
          {formatDate(row.original.createdAt, locale)}
        </span>
      ),
  },
  {
    accessorKey: 'createdBy',
    enableSorting: false,
    header: t(
      'Pages.Releases.Components.Table.Columns.createdBy',
      'Created by',
    ),
    cell: ({ row }) =>
      isHeadingVersions(row) ? null : (
        <span className="text-sm">
          {getAuditDisplayName({ actor: row.original.createdBy }) || '—'}
        </span>
      ),
  },
];

export function ComponentsTable({
  components,
  onClickNew,
}: ComponentsTableProps) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  // Whenever the catalog holds a component with several versions, every
  // component row keeps room for the toggle: filtering never shifts the names.
  const hasVersionedComponents = useMemo(
    () =>
      new Set(components.map((component) => component.name)).size <
      components.length,
    [components],
  );
  const columns = useMemo(
    () => createColumns(hasVersionedComponents, locale, t),
    [hasVersionedComponents, locale, t],
  );
  const filterFields = useMemo(
    () => createComponentCatalogFilterFields(components, t),
    [components, t],
  );
  const filterController = useFilterBuilder({
    data: components,
    fields: filterFields,
    pinnedFilterIds: ['name'],
    debounceMs: 0,
    resetOnDataChange: true,
  });
  // A component shows the versions that match: a version filter can leave
  // just one, which then stands as the component's row.
  const groups = useMemo(
    () => groupComponentCatalogRows(filterController.filteredData),
    [filterController.filteredData],
  );

  return (
    <FilterTableLayout controller={filterController}>
      <FilterTableLayout.Toolbar>
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search filterId="name" />
          {onClickNew ? (
            <FilterTableLayout.Actions>
              <GradientButton
                onClick={onClickNew}
                label={t('Pages.Releases.Components.Actions.create')}
              />
            </FilterTableLayout.Actions>
          ) : null}
        </FilterTableLayout.ToolbarRow>
        <FilterTableLayout.Filters />
      </FilterTableLayout.Toolbar>

      <FilterTableLayout.Content>
        <DataTable<ComponentCatalogEntry>
          className="h-full"
          columns={columns}
          data={groups}
          getRowId={getComponentCatalogEntryId}
          getSubRows={getComponentCatalogEntryVersions}
          // A click anywhere on a component with several versions opens them.
          isRowClickable={(entry) =>
            getComponentCatalogEntryVersions(entry) !== undefined
          }
          onClickRow={(row) => row.toggleExpanded()}
          bodyScrollable
          // With components hidden by a filter, the default "No results" is right.
          emptyMessage={
            components.length === 0
              ? t(
                  'Pages.Releases.Components.Table.empty',
                  'No components yet. Create one to get started.',
                )
              : undefined
          }
        />
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
}
