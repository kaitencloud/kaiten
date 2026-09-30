import {
  columnVisibilityFeature,
  createExpandedRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  metaHelper,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from '@tanstack/react-table';

/**
 * Column metadata specific to `DataTable`. Declared through the `columnMeta`
 * slot rather than with `declare module`: the typing stays local to the tables
 * built with these features, with no global augmentation of the library.
 */
export type DataTableColumnMeta = {
  cellClassName?: string;
  defaultSort?: 'asc' | 'desc';
  headerClassName?: string;
};

/**
 * The feature set of every table in the app. In v9 you have to declare
 * explicitly what you use: only the code of the registered features ends up in
 * the bundle, and unregistered APIs do not exist (neither in the types nor at
 * runtime).
 *
 * - `columnVisibilityFeature`: `row.getVisibleCells()`
 * - `rowSortingFeature`: client-side sorting
 * - `rowPaginationFeature`: client-side pagination
 * - `rowExpandingFeature`: collapsible child rows (`getSubRows`)
 *
 * The registered `sortFns` are the ones the `'auto'` detection can resolve
 * (`datetime`, `alphanumeric`, `text`); `basic` is the internal fallback and
 * does not need to be registered.
 */
export const dataTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;
