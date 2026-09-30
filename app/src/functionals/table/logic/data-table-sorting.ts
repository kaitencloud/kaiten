import type { CellData, RowData, SortingState } from '@tanstack/react-table';
import type { ColumnDef } from '../types/data-table.types';

export function getColumnSortId<
  TData extends RowData,
  TValue extends CellData = CellData,
>(column: ColumnDef<TData, TValue>): string | undefined {
  if (column.id) {
    return column.id;
  }

  if ('accessorKey' in column && column.accessorKey != null) {
    return String(column.accessorKey);
  }

  return undefined;
}

export function deriveDefaultSortingFromColumns<
  TData extends RowData,
  TValue extends CellData = CellData,
>(columns: ColumnDef<TData, TValue>[]): SortingState {
  for (const col of columns) {
    const defaultSort = col.meta?.defaultSort;
    if (!defaultSort) {
      continue;
    }

    const id = getColumnSortId(col);
    if (id) {
      return [{ id, desc: defaultSort === 'desc' }];
    }
  }

  return [];
}
