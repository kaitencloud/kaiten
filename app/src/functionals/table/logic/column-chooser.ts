import type { RowData } from '@tanstack/react-table';
import type { ColumnDef } from '../types/data-table.types';

/** A column the person may hide, named as its header reads. */
export type ChoosableColumn = {
  id: string;
  label: string;
};

// The title of a header built by `dataTableSortableHeader`: the header is a
// function, and the title it renders is what the column chooser lists.
const sortableHeaderTitles = new WeakMap<object, string>();

export function rememberHeaderTitle(header: object, title: unknown) {
  if (typeof title === 'string' && title.length > 0) {
    sortableHeaderTitles.set(header, title);
  }
}

/** The text a column's header reads, when it is one. */
export function columnLabelOf<TData extends RowData>(
  column: ColumnDef<TData>,
): string | undefined {
  const { header } = column;
  if (typeof header === 'string') {
    return header.length > 0 ? header : undefined;
  }
  if (typeof header === 'function') {
    return sortableHeaderTitles.get(header);
  }

  return undefined;
}

// The id TanStack Table gives a column: its `id`, else its `accessorKey` with
// dots made underscores, else its header when that is a string.
function columnIdOf<TData extends RowData>(
  column: ColumnDef<TData>,
): string | undefined {
  const { accessorKey, id } = column as {
    accessorKey?: unknown;
    id?: string;
  };
  if (id) {
    return id;
  }
  if (accessorKey !== undefined) {
    return String(accessorKey).replaceAll('.', '_');
  }

  return typeof column.header === 'string' ? column.header : undefined;
}

/**
 * The columns a person may hide, in the table's order: every column with a
 * header text, except the row's identity (`linkColumnId`, the column that
 * carries the row's link) and the columns that set `enableHiding: false` (the
 * row actions). A column group is never listed.
 */
export function getChoosableColumns<TData extends RowData>(
  columns: readonly ColumnDef<TData>[],
  linkColumnId: string,
): ChoosableColumn[] {
  const choosable: ChoosableColumn[] = [];

  for (const column of columns) {
    if ('columns' in column && column.columns) {
      continue;
    }
    if (column.enableHiding === false) {
      continue;
    }
    const id = columnIdOf(column);
    if (!id || id === linkColumnId) {
      continue;
    }
    const label = columnLabelOf(column);
    if (label) {
      choosable.push({ id, label });
    }
  }

  return choosable;
}

/**
 * The visibility state of the table for the hidden ids: only the ids of
 * choosable columns count, so a stored id the table no longer has, or one of a
 * column that cannot be hidden, changes nothing.
 */
export function columnVisibilityOf(
  choosable: readonly ChoosableColumn[],
  hidden: readonly string[],
): Record<string, boolean> {
  const hiddenIds = new Set(hidden);
  const visibility: Record<string, boolean> = {};

  for (const column of choosable) {
    if (hiddenIds.has(column.id)) {
      visibility[column.id] = false;
    }
  }

  return visibility;
}
