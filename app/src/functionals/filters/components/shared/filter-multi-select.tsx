import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { FILTER_MULTI_SELECT_SEPARATOR } from '../../constants';
import type { FilterOption } from '../../types/filter.types';

// Re-exported here so existing import paths
// (`@/functionals/filters`, `components/shared`) keep resolving the constant.
export { FILTER_MULTI_SELECT_SEPARATOR };

type FilterMultiSelectProps = {
  options: FilterOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** When the user picks nothing this label is rendered. */
  emptyLabel?: string;
};

// Encodes the selected options as a separator-delimited string in the
// FilterModel.values — the canonical wire format expected by
// `filter-value-evaluator.ts::parseFilterSelection`. Keeping the FilterModel
// values uniformly `string` avoids a much wider refactor in the existing
// store / serialization. The separator itself is defined in `../../constants`.
const parseValue = (raw: string): Set<string> => {
  if (!raw) return new Set();
  return new Set(
    raw.split(FILTER_MULTI_SELECT_SEPARATOR).flatMap((value) => {
      const trimmed = value.trim();
      return trimmed.length > 0 ? [trimmed] : [];
    }),
  );
};

const serializeValue = (set: Set<string>): string =>
  // Stable sort keeps the rendered label deterministic across renders.
  [...set].sort().join(FILTER_MULTI_SELECT_SEPARATOR);

export function FilterMultiSelect({
  options,
  value,
  onValueChange,
  placeholder,
  emptyLabel,
}: FilterMultiSelectProps) {
  const selected = parseValue(value);

  const toggle = (optionValue: string) => {
    const next = new Set(selected);
    if (next.has(optionValue)) {
      next.delete(optionValue);
    } else {
      next.add(optionValue);
    }
    onValueChange(serializeValue(next));
  };

  const label = (() => {
    if (selected.size === 0) {
      return emptyLabel ?? placeholder ?? '';
    }
    if (selected.size <= 2) {
      const picked = options.flatMap((option) =>
        selected.has(option.value) ? [option.label] : [],
      );
      return picked.length > 0
        ? picked.join(', ')
        : `${selected.size} selected`;
    }
    return `${selected.size} selected`;
  })();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between font-normal"
          type="button"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="text-muted-foreground ml-2 size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-72 w-56 overflow-y-auto p-1"
      >
        {options.length === 0 ? (
          <div className="text-muted-foreground p-2 text-sm">
            {emptyLabel ?? 'No options'}
          </div>
        ) : (
          <ul className="space-y-1">
            {options.map((option) => {
              const checked = selected.has(option.value);
              return (
                <li key={option.value}>
                  <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded p-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
