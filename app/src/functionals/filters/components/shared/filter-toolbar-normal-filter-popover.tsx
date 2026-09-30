import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import type { FilterFieldDefinition } from '../../types/filter.types';
import type { FilterToolbarLabels } from '../../types/toolbar.types';
import { FilterOptionList } from './filter-option-list';
import { hasOptionList } from './filter-toolbar-utils';
import { FilterValueInput } from './filter-toolbar-value-input';

type NormalFilterPopoverProps<T> = {
  field: FilterFieldDefinition<T>;
  labels: Pick<
    FilterToolbarLabels,
    | 'all'
    | 'clearFilter'
    | 'falseValue'
    | 'filterBy'
    | 'filterFieldPlaceholder'
    | 'noResult'
    | 'trueValue'
  >;
  onClear?: () => void;
  onOpenChange: (open: boolean) => void;
  onRemove?: () => void;
  onValueChange: (nextValue: string) => void;
  open: boolean;
  operatorLabel: string;
  removeAriaLabel?: string;
  trigger: ReactElement;
  value: string;
};

export function NormalFilterPopover<T>({
  field,
  labels,
  onClear,
  onOpenChange,
  onRemove,
  onValueChange,
  open,
  operatorLabel,
  removeAriaLabel,
  trigger,
  value,
}: NormalFilterPopoverProps<T>) {
  // A field picked from a list opens straight onto the list: the chip already
  // names the field, and its operator is the only one it has. The list grows
  // with its options (a webhook URL, say) up to a bound, past which they wrap.
  // A searchable one takes that bound from the start, or it would resize as
  // the search narrows it.
  if (hasOptionList(field)) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          className={cn(
            'max-w-[min(92vw,420px)] p-0',
            field.searchable
              ? 'w-[min(92vw,420px)]'
              : 'w-auto min-w-[min(92vw,280px)]',
          )}
        >
          <FilterOptionList
            field={field}
            value={value}
            labels={labels}
            onValueChange={onValueChange}
            onChosen={() => onOpenChange(false)}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,360px)] p-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{field.label}</span>
              <Badge variant="outline" className="h-6 rounded-md px-2">
                {operatorLabel}
              </Badge>
            </div>
            {onRemove ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={removeAriaLabel}
                onClick={onRemove}
              />
            ) : null}
          </div>

          <FilterValueInput
            field={field}
            value={value}
            onValueChange={onValueChange}
            labels={labels}
          />

          {onClear && value.trim().length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-0"
              onClick={onClear}
            >
              {labels.clearFilter}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
