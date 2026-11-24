import type { PropsWithChildren, ReactNode } from 'react';
import {
  FilterSearchInput,
  FilterToolbarFilterButton,
  FilterToolbarFiltersRow,
  FilterToolbarProvider,
  type UseFilterBuilderResult,
} from '@/functionals/filters';
import { cn } from '@/lib/utils';
import { ColumnChooserProvider } from '../column-chooser/column-chooser-context';
import { DataTableColumnsButton } from '../column-chooser/data-table-columns-button';

type FilterTableLayoutRootProps<TData> = PropsWithChildren<{
  className?: string;
  /**
   * Turns on the Columns button beside the Filter button: the person hides
   * columns of the `DataTable` inside, and the choice is kept in this browser
   * for this table (the value names it, `instances`) and the organization.
   */
  columnChooser?: string;
  controller: UseFilterBuilderResult<TData>;
  showAdvancedOption?: boolean;
}>;

const Root = <TData,>({
  className,
  columnChooser,
  controller,
  showAdvancedOption = false,
  children,
}: FilterTableLayoutRootProps<TData>) => {
  const layout = (
    <FilterToolbarProvider
      controller={controller}
      showAdvancedOption={showAdvancedOption}
    >
      <div className={cn('flex h-full min-h-0 flex-col pt-6', className)}>
        {children}
      </div>
    </FilterToolbarProvider>
  );

  return columnChooser ? (
    <ColumnChooserProvider tableId={columnChooser}>
      {layout}
    </ColumnChooserProvider>
  ) : (
    layout
  );
};

type FilterTableLayoutToolbarProps = PropsWithChildren<{
  className?: string;
}>;

const Toolbar = ({ className, children }: FilterTableLayoutToolbarProps) => (
  <div className={cn('space-y-3', className)}>{children}</div>
);

type FilterTableLayoutToolbarRowProps = PropsWithChildren<{
  className?: string;
}>;

const ToolbarRow = ({
  className,
  children,
}: FilterTableLayoutToolbarRowProps) => (
  <div
    className={cn('flex flex-col gap-3 md:flex-row md:items-start', className)}
  >
    {children}
  </div>
);

type FilterTableLayoutSearchProps = {
  buttonClassName?: string;
  className?: string;
  filterId: string;
  inputClassName?: string;
  children?: ReactNode;
};

const Search = ({
  buttonClassName,
  children,
  className,
  filterId,
  inputClassName,
}: FilterTableLayoutSearchProps) => (
  <div
    className={cn(
      'flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto',
      className,
    )}
  >
    <FilterSearchInput
      filterId={filterId}
      className={cn('w-full sm:w-[320px]', inputClassName)}
    />
    {children}
    <FilterToolbarFilterButton className={cn('sm:shrink-0', buttonClassName)} />
    <DataTableColumnsButton className={cn('sm:shrink-0', buttonClassName)} />
  </div>
);

type FilterTableLayoutActionsProps = PropsWithChildren<{
  className?: string;
}>;

const Actions = ({ className, children }: FilterTableLayoutActionsProps) => (
  <div className={cn('flex items-center md:ml-auto', className)}>
    {children}
  </div>
);

type FilterTableLayoutFiltersProps = {
  className?: string;
};

const Filters = ({ className }: FilterTableLayoutFiltersProps) => (
  <FilterToolbarFiltersRow className={className} />
);

type FilterTableLayoutContentProps = PropsWithChildren<{
  className?: string;
}>;

const Content = ({ className, children }: FilterTableLayoutContentProps) => (
  <div className={cn('mt-6 flex-1 min-h-0', className)}>{children}</div>
);

export const FilterTableLayout = Object.assign(Root, {
  Toolbar,
  ToolbarRow,
  Search,
  Actions,
  Filters,
  Content,
});
