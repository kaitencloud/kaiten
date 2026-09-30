import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronDown, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FilterToolbarFilterButtonProps } from '../../types/toolbar.types';
import { FilterPickerMenu } from '../shared';
import { useFilterToolbarContext } from './filter-toolbar-provider';

export function FilterToolbarFilterButton({
  className,
}: FilterToolbarFilterButtonProps) {
  const {
    labels: copy,
    filterMenuOpen,
    setFilterMenuOpen,
    activeFilterCount,
    canOpenFilterMenu,
    isFilterRowVisible,
    handleFilterButtonClick,
  } = useFilterToolbarContext<unknown>();

  if (activeFilterCount === 0 && !canOpenFilterMenu) {
    return null;
  }

  if (activeFilterCount === 0) {
    return (
      <Popover open={filterMenuOpen} onOpenChange={setFilterMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-9 gap-2', className)}
          >
            <Filter className="size-4" />
            {copy.filtersButton}
            <ChevronDown className="size-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[280px] p-0">
          <FilterPickerMenu />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={cn('h-9 gap-2', className)}
      onClick={handleFilterButtonClick}
    >
      <Filter className="size-4" />
      {copy.filtersButton}
      <span className="bg-background text-foreground inline-flex size-5 items-center justify-center rounded-full text-xs font-medium">
        {activeFilterCount}
      </span>
      <ChevronDown
        className={cn(
          'size-4 opacity-60 transition-transform',
          isFilterRowVisible && 'rotate-180',
        )}
      />
    </Button>
  );
}
