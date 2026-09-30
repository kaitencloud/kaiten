import type {
  CellData,
  Cell as TanStackCell,
  Column as TanStackColumn,
  ColumnDef as TanStackColumnDef,
  Row as TanStackRow,
  Table as TanStackTable,
  PaginationState,
  RowData,
  SortingState,
} from '@tanstack/react-table';
import type { ReactNode } from 'react';
import type { DataTableFeatures } from '../logic/data-table-features';

/**
 * In v9 every type of the library takes the feature set as its first
 * parameter (`ColumnDef<TFeatures, TData, TValue>`). Rather than spread
 * `typeof dataTableFeatures` over every column declaration in the app, we
 * expose here the same names already bound to our features: callers keep
 * writing `ColumnDef<Customer>` and import from `@/functionals/table`.
 */
export type ColumnDef<
  TData extends RowData,
  TValue extends CellData = CellData,
> = TanStackColumnDef<DataTableFeatures, TData, TValue>;

export type Row<TData extends RowData> = TanStackRow<DataTableFeatures, TData>;

export type Cell<
  TData extends RowData,
  TValue extends CellData = CellData,
> = TanStackCell<DataTableFeatures, TData, TValue>;

export type Column<
  TData extends RowData,
  TValue extends CellData = CellData,
> = TanStackColumn<DataTableFeatures, TData, TValue>;

export type TableInstance<TData extends RowData> = TanStackTable<
  DataTableFeatures,
  TData
>;

export type DataTablePaginationConfig = {
  enabled?: boolean;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  showPageSizeSelector?: boolean;
};

export type DataTablePaginationProp =
  | boolean
  | DataTablePaginationConfig
  | undefined;

export type DataTableVariant = 'default' | 'simple';

export type DataTableProps<TData extends RowData> = {
  bodyScrollable?: boolean;
  className?: string;
  columns: ColumnDef<TData>[];
  data: TData[];
  emptyMessage?: ReactNode;
  enableRowKeyboardNavigation?: boolean;
  /**
   * Where a row leads. Its `linkColumnId` cell becomes a real link: Tab and
   * Enter, cmd/ctrl or middle click, "Open in new tab", "Copy link". A click
   * anywhere else on the row follows it too, in a new tab when modified.
   */
  getPath?: (row: TData) => string | undefined;
  getRowClassName?: (row: TData) => string | undefined;
  /**
   * A stable id per row. Without it a row is identified by its index, so a
   * refetch that reorders the data hands a row's component state -- an open
   * dialog, a pending action -- to whichever row now sits at that index.
   */
  getRowId?: (row: TData) => string;
  /**
   * A row's children, listed under it once it is expanded; a row without any
   * stays a plain row. Rows start collapsed, and a cell opens one with
   * `DataTableRowExpander`. The page size counts top-level rows only, so
   * children always show on their parent's page. Give `getRowId` too: rows
   * stay expanded by id when the data changes.
   */
  getSubRows?: (row: TData) => readonly TData[] | undefined;
  initialSorting?: SortingState;
  isRowClickable?: (row: TData) => boolean;
  /** The column whose cell carries the row's link. Defaults to `name`. */
  linkColumnId?: string;
  onClickRow?: (row: Row<TData>) => void;
  pagination?: DataTablePaginationProp;
  tableClassName?: string;
  variant?: DataTableVariant;
};

export type DataTablePaginationState = PaginationState;

export type {
  DataTableColumnMeta,
  DataTableFeatures,
} from '../logic/data-table-features';
export type { CellData, RowData, SortingState } from '@tanstack/react-table';
