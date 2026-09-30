import { Button } from '@/components/ui/button';
import type { CellData, RowData } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, SortAsc } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Column, ColumnDef } from '../../types/data-table.types';

export type DataTableSortHeaderProps<
  TData extends RowData,
  TValue extends CellData = CellData,
> = {
  column: Column<TData, TValue>;
  children: ReactNode;
  className?: string;
};

export function DataTableSortHeader<
  TData extends RowData,
  TValue extends CellData = CellData,
>({ column, children, className }: DataTableSortHeaderProps<TData, TValue>) {
  const { t } = useTranslation();

  if (!column.getCanSort()) {
    return <div className={cn(className)}>{children}</div>;
  }

  const sorted = column.getIsSorted();
  const columnLabel =
    typeof children === 'string' ? children : String(column.id);
  const ariaLabel =
    sorted === 'desc'
      ? t('Common.tableSortAriaDesc', { column: columnLabel })
      : sorted === 'asc'
        ? t('Common.tableSortAriaAsc', { column: columnLabel })
        : t('Common.tableSortAriaNone', { column: columnLabel });

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          'group -ms-3 h-8 rounded-lg px-2.5',
          // Ghost without an accent color: transparent background on the bg-muted header, neutral hover via --card (styles.css)
          'bg-transparent text-muted-foreground hover:bg-card hover:text-foreground',
          'dark:hover:bg-card',
          'focus-visible:ring-border/50 focus-visible:ring-offset-2 focus-visible:ring-offset-muted',
        )}
        aria-label={ariaLabel}
        onClick={column.getToggleSortingHandler()}
      >
        <span>{children}</span>
        {sorted === 'desc' ? (
          <ArrowDown className="ms-2 size-4 shrink-0" aria-hidden />
        ) : sorted === 'asc' ? (
          <ArrowUp className="ms-2 size-4 shrink-0" aria-hidden />
        ) : (
          <SortAsc
            className="ms-2 size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden
          />
        )}
      </Button>
    </div>
  );
}

export function dataTableSortableHeader<
  TData extends RowData,
  TValue extends CellData = CellData,
>(title: ReactNode): ColumnDef<TData, TValue>['header'] {
  return ({ column }) => (
    <DataTableSortHeader column={column}>{title}</DataTableSortHeader>
  );
}
