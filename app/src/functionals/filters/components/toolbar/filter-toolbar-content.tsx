import { cn } from '@/lib/utils';
import type { FilterToolbarContentProps } from '../../types/toolbar.types';
import { FilterToolbarFilterButton } from './filter-toolbar-filter-button';
import { FilterToolbarFiltersRow } from './filter-toolbar-filters-row';
import { useFilterToolbarContext } from './filter-toolbar-provider';
import { FilterToolbarQuickAccessFilters } from './filter-toolbar-quick-access-filters';
import { FilterSearchInput } from './filter-toolbar-search-input';

function renderPinnedField(field: { id: string }) {
  return <FilterSearchInput key={field.id} filterId={field.id} />;
}

export function FilterToolbarContent({
  className,
  children,
  showFilterButton = true,
  filterButtonClassName,
}: FilterToolbarContentProps) {
  const { controller } = useFilterToolbarContext<unknown>();

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {controller.normal.pinnedFields.map(renderPinnedField)}
          <FilterToolbarQuickAccessFilters />
        </div>

        <div className="flex items-center gap-2 md:ml-auto">
          {showFilterButton ? (
            <FilterToolbarFilterButton className={filterButtonClassName} />
          ) : null}
          {children ? <div>{children}</div> : null}
        </div>
      </div>

      <FilterToolbarFiltersRow />
    </div>
  );
}
