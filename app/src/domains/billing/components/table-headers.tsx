import type { ReactNode } from 'react';
import { type ColumnDef, DataTableSortHeader } from '@/functionals/table';

/**
 * The header of a column of amounts or quantities, aligned right over them. It is
 * a function that returns a header, not a component, so it has a module of its
 * own: a file that exports components and anything else cannot be hot reloaded.
 */
export const rightAlignedHeader = (title: ReactNode) => () => (
  <div className="text-right">{title}</div>
);

/**
 * The same header for a column that sorts: the button that toggles the sort ends
 * where the amounts end, so that the arrow sits over the last digit. The negative
 * margin takes back the padding of the button.
 */
export function rightAlignedSortableHeader<TData extends object>(
  title: string,
): ColumnDef<TData>['header'] {
  return ({ column }) => (
    <DataTableSortHeader className="-me-2.5 justify-end" column={column}>
      {title}
    </DataTableSortHeader>
  );
}
