import {
  type ExpandedState,
  type RowData,
  type SortingState,
  type TableOptions,
  useTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  dataTableFeatures,
  type DataTableFeatures,
} from '../../logic/data-table-features';
import { deriveDefaultSortingFromColumns } from '../../logic/data-table-sorting';
import {
  buildVisiblePageIndexes,
  DATA_TABLE_VARIANT_CLASSES,
  resolvePaginationConfig,
} from '../../logic/data-table-utils';
import type { DataTableProps } from '../../types/data-table.types';
import { DataTableContent } from './data-table-content';
import { DataTablePagination } from './data-table-pagination';

export function DataTable<TData extends RowData>({
  className,
  tableClassName,
  onClickRow,
  columns,
  data,
  getPath,
  getRowId,
  getSubRows,
  isRowClickable = () => true,
  getRowClassName,
  linkColumnId = 'name',
  pagination,
  bodyScrollable = false,
  variant = 'default',
  enableRowKeyboardNavigation = false,
  emptyMessage,
  initialSorting,
}: DataTableProps<TData>) {
  const hasScrollableBody = bodyScrollable;
  const paginationConfig = useMemo(
    () => resolvePaginationConfig(pagination),
    [pagination],
  );
  const [paginationState, setPaginationState] = useState({
    pageIndex: 0,
    pageSize: paginationConfig.defaultPageSize,
  });
  const [sorting, setSorting] = useState<SortingState>(() => {
    if (initialSorting !== undefined) {
      return initialSorting;
    }

    return deriveDefaultSortingFromColumns(columns);
  });
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const tableConfig: TableOptions<DataTableFeatures, TData> = {
    features: dataTableFeatures,
    columns,
    data,
    ...(getRowId ? { getRowId: (row: TData) => getRowId(row) } : {}),
    ...(getSubRows ? { getSubRows: (row: TData) => getSubRows(row) } : {}),
    onSortingChange: setSorting,
    onPaginationChange: paginationConfig.enabled
      ? setPaginationState
      : undefined,
    onExpandedChange: setExpanded,
    // v9 collapses every row whenever `data` changes, and a filter keystroke or
    // a refetch hands the table a new array: rows found again by id stay open.
    autoResetExpanded: false,
    // A parent and its children share a page; the page size counts parents.
    paginateExpandedRows: false,
    enableSortingRemoval: true,
    state: {
      sorting,
      // The paginated row model is always registered (features are static in
      // v9): `pageSize: Infinity` neutralizes it, with no slicing, when the
      // caller does not want pagination.
      pagination: paginationConfig.enabled
        ? paginationState
        : { pageIndex: 0, pageSize: Number.POSITIVE_INFINITY },
      expanded,
    },
  };

  const table = useTable(tableConfig);
  const rowCount = data.length;
  const activePageIndex = paginationConfig.enabled
    ? table.state.pagination.pageIndex
    : 0;
  const activePageSize = paginationConfig.enabled
    ? table.state.pagination.pageSize
    : rowCount;
  const rawPageCount = paginationConfig.enabled ? table.getPageCount() : 1;
  const pageCount = paginationConfig.enabled ? Math.max(1, rawPageCount) : 1;
  const shouldRenderPagination = paginationConfig.enabled && rawPageCount > 1;
  const visiblePageIndexes = paginationConfig.enabled
    ? buildVisiblePageIndexes(activePageIndex, pageCount)
    : [];

  return (
    <div
      className={cn(
        DATA_TABLE_VARIANT_CLASSES[variant].container,
        hasScrollableBody && 'flex min-h-0 flex-col',
        bodyScrollable && 'h-full',
        className,
      )}
    >
      <DataTableContent<TData>
        bodyScrollable={bodyScrollable}
        columnsLength={columns.length}
        emptyMessage={emptyMessage}
        enableRowKeyboardNavigation={enableRowKeyboardNavigation}
        getPath={getPath}
        getRowClassName={getRowClassName}
        hasScrollableBody={hasScrollableBody}
        isRowClickable={isRowClickable}
        linkColumnId={linkColumnId}
        onClickRow={onClickRow}
        table={table}
        tableClassName={tableClassName}
        variant={variant}
      />
      <DataTablePagination
        activePageIndex={activePageIndex}
        activePageSize={activePageSize}
        pageCount={pageCount}
        paginationConfig={paginationConfig}
        rowCount={rowCount}
        shouldRenderPagination={shouldRenderPagination}
        table={table}
        variant={variant}
        visiblePageIndexes={visiblePageIndexes}
      />
    </div>
  );
}
