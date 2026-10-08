import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Plus, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FILTER_OPERATOR_LABELS,
  getDefaultOperatorForFieldType,
} from '../../logic/filter-logic';
import type { FilterToolbarFiltersRowProps } from '../../types/toolbar.types';
import { AdvancedFiltersPopover } from '../advanced';
import {
  FilterChip,
  FilterPickerMenu,
  getFilterBadgeLabel,
  NormalFilterPopover,
} from '../shared';
import { useFilterToolbarContext } from './filter-toolbar-provider';

export function FilterToolbarFiltersRow({
  className,
}: FilterToolbarFiltersRowProps) {
  const {
    controller,
    labels: copy,
    showAdvancedOption,
    addFilterOpen,
    setAddFilterOpen,
    showFilterRow,
    showAddFilterButton,
    openNormalFilterId,
    setOpenNormalFilterId,
  } = useFilterToolbarContext<unknown>();

  if (!showFilterRow) {
    return null;
  }

  function renderActiveField(
    field: (typeof controller.normal.activeFields)[number],
  ) {
    const value = controller.normal.values[field.id] ?? '';
    const operatorLabel =
      FILTER_OPERATOR_LABELS[getDefaultOperatorForFieldType(field.type)];
    const removeAriaLabel = copy.removeFilterForField.replace(
      '{{field}}',
      field.label,
    );

    return (
      <FilterChip
        key={field.id}
        onRemove={() => {
          controller.normal.removeFilter(field.id);
          if (openNormalFilterId === field.id) {
            setOpenNormalFilterId(null);
          }
        }}
        removeLabel={removeAriaLabel}
      >
        <NormalFilterPopover
          field={field}
          labels={copy}
          open={openNormalFilterId === field.id}
          onOpenChange={(open) => setOpenNormalFilterId(open ? field.id : null)}
          onValueChange={(nextValue) => {
            controller.normal.setValue(field.id, nextValue);
          }}
          onClear={() => controller.normal.setValue(field.id, '')}
          operatorLabel={operatorLabel}
          value={value}
          trigger={
            <button
              type="button"
              className="max-w-[240px] truncate text-sm"
              title={getFilterBadgeLabel(field, value, copy)}
            >
              {getFilterBadgeLabel(field, value, copy)}
            </button>
          }
        />
      </FilterChip>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm font-medium">
          {copy.filterBy}
        </span>

        {controller.normal.activeFields.map(renderActiveField)}

        {showAddFilterButton ? (
          <Popover open={addFilterOpen} onOpenChange={setAddFilterOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full border-dashed px-4"
                >
                  <Plus className="size-4" />
                  {copy.addFilter}
                </Button>
              }
            />
            <PopoverContent align="start" className="w-[280px] p-0">
              <FilterPickerMenu />
            </PopoverContent>
          </Popover>
        ) : null}

        {showAdvancedOption ? <AdvancedFiltersPopover /> : null}

        {controller.hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={controller.resetAll}
          >
            <RotateCcw className="size-4" />
            {copy.reset}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
