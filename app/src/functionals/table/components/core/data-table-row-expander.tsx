import { Button } from '@/components/ui/button';
import type { RowData } from '@tanstack/react-table';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Row } from '../../types/data-table.types';

type DataTableRowExpanderProps<TData extends RowData> = {
  /**
   * Names what the toggle shows, e.g. "Versions of API". Whether it is open
   * is announced from `aria-expanded`.
   */
  label: string;
  row: Row<TData>;
};

/**
 * Shows and hides a row's children (`getSubRows` on `DataTable`). A row
 * without any gets an empty slot of the same width, so the cells of a column
 * line up whether their row has children or not.
 */
export function DataTableRowExpander<TData extends RowData>({
  label,
  row,
}: DataTableRowExpanderProps<TData>) {
  if (!row.getCanExpand()) {
    return <span aria-hidden className="w-6 shrink-0" />;
  }

  const expanded = row.getIsExpanded();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      // Centered on the cell's first line without making the row taller.
      className="-my-0.5 shrink-0 text-muted-foreground hover:text-foreground"
      aria-expanded={expanded}
      aria-label={label}
      // The toggle handles its own clicks: the row must not act on them too.
      data-row-actions
      onClick={row.getToggleExpandedHandler()}
    >
      <ChevronRight
        aria-hidden
        className={cn(
          'size-4 motion-safe:transition-transform',
          expanded && 'rotate-90',
        )}
      />
    </Button>
  );
}
