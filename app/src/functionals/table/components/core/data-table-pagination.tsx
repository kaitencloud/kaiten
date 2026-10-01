import { Button } from '@/components/ui/button';
import type { RowData } from '@tanstack/react-table';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { DATA_TABLE_VARIANT_CLASSES } from '../../logic/data-table-utils';
import type {
  DataTablePaginationConfig,
  DataTableVariant,
  TableInstance,
} from '../../types/data-table.types';

type DataTablePaginationProps<TData extends RowData> = {
  activePageIndex: number;
  activePageSize: number;
  pageCount: number;
  paginationConfig: Required<DataTablePaginationConfig>;
  rowCount: number;
  shouldRenderPagination: boolean;
  table: TableInstance<TData>;
  variant: DataTableVariant;
  visiblePageIndexes: number[];
};

function renderPageSizeOption(option: number) {
  return (
    <SelectItem key={option} value={String(option)}>
      {option}
    </SelectItem>
  );
}

export function DataTablePagination<TData extends RowData>({
  activePageIndex,
  activePageSize,
  pageCount,
  paginationConfig,
  rowCount,
  shouldRenderPagination,
  table,
  variant,
  visiblePageIndexes,
}: DataTablePaginationProps<TData>) {
  const { t } = useTranslation();
  const rangeStart = rowCount === 0 ? 0 : activePageIndex * activePageSize + 1;
  const rangeEnd =
    rowCount === 0
      ? 0
      : Math.min((activePageIndex + 1) * activePageSize, rowCount);

  if (!shouldRenderPagination || pageCount <= 1) {
    return null;
  }

  function renderPageButton(pageIndex: number) {
    return (
      <Button
        key={pageIndex}
        variant={pageIndex === activePageIndex ? 'secondary' : 'ghost'}
        size="icon-sm"
        className={cn(
          'h-8 w-8',
          pageIndex === activePageIndex &&
            'bg-primary text-primary-foreground hover:bg-primary-hover',
        )}
        onClick={() => table.setPageIndex(pageIndex)}
      >
        {pageIndex + 1}
      </Button>
    );
  }

  return (
    <div
      className={cn(
        DATA_TABLE_VARIANT_CLASSES[variant].paginationContainer,
        'pb-2',
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>
            {t('Common.tableShowingRecords', {
              start: rangeStart,
              end: rangeEnd,
              total: rowCount,
              defaultValue: 'Showing {{start}}-{{end}} of {{total}} records',
            })}
          </span>
          {paginationConfig.showPageSizeSelector ? (
            <div className="flex items-center gap-2">
              <span>{t('Common.rowsPerPage', 'Rows per page')}</span>
              <Select
                items={paginationConfig.pageSizeOptions.map((value) => ({
                  value: String(value),
                  label: String(value),
                }))}
                value={String(activePageSize)}
                onValueChange={(value) => {
                  table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paginationConfig.pageSizeOptions.map(renderPageSizeOption)}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            className="h-8 w-8"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label={t('Common.firstPage', 'First page')}
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="size-4" />
            {t('Common.previous', 'Previous')}
          </Button>
          {visiblePageIndexes.map(renderPageButton)}
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {t('Common.next', 'Next')}
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="h-8 w-8"
            onClick={() => table.lastPage()}
            disabled={!table.getCanNextPage()}
            aria-label={t('Common.lastPage', 'Last page')}
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
