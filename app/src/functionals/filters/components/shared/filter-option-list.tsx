import { Check } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { FILTER_MULTI_SELECT_SEPARATOR } from '../../constants';
import type { FilterFieldDefinition } from '../../types/filter.types';
import type { FilterToolbarLabels } from '../../types/toolbar.types';
import { getFieldOptions, parseFilterValues } from './filter-toolbar-utils';

type FilterOptionListProps<T> = {
  field: FilterFieldDefinition<T>;
  value: string;
  labels: Pick<
    FilterToolbarLabels,
    | 'all'
    | 'clearFilter'
    | 'falseValue'
    | 'filterFieldPlaceholder'
    | 'noResult'
    | 'trueValue'
  >;
  onValueChange: (value: string) => void;
  /** Called once a single-choice field has its value, to close the editor. */
  onChosen: () => void;
};

/**
 * The search box's matcher: an option matches when it contains every word
 * typed, in any order. cmdk's default is fuzzy -- it keeps any option holding
 * the typed letters in order -- which on URLs and event names keeps nearly all
 * of them.
 */
function containsEveryWord(value: string, search: string): number {
  const option = value.toLowerCase();
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);

  return words.every((word) => option.includes(word)) ? 1 : 0;
}

/**
 * The editor of a field filtered by picking from a list (see hasOptionList):
 * the list itself, with nothing in front of it.
 *
 * - enum_list: several choices; each toggles, and the list stays open.
 * - enum: one choice, or "All"; picking closes the list.
 * - boolean: true or false, and no "All" -- a yes/no filter is either set or
 *   not. Picking the set value again clears it, and so does "Clear filter".
 *
 * Built on the same Command as the "Filter" button's field picker, so both
 * menus look and navigate alike. The search box is the field's opt-in
 * (`searchable`): a handful of options reads faster without one.
 */
export function FilterOptionList<T>({
  field,
  value,
  labels,
  onValueChange,
  onChosen,
}: FilterOptionListProps<T>) {
  const multiple = field.type === 'enum_list';
  const offersAll = field.type === 'enum';
  const options = getFieldOptions(field, labels);
  const selected = new Set(
    parseFilterValues(field, value).map((selection) => selection.toLowerCase()),
  );

  const toggle = (optionValue: string) => {
    const next = new Set(parseFilterValues(field, value));
    const present = [...next].find(
      (selection) => selection.toLowerCase() === optionValue.toLowerCase(),
    );
    if (present) {
      next.delete(present);
    } else {
      next.add(optionValue);
    }
    // Sorted so the same selection always serializes the same way.
    onValueChange([...next].sort().join(FILTER_MULTI_SELECT_SEPARATOR));
  };

  const choose = (optionValue: string) => {
    // Picking the value already set clears it: the only way back to "no
    // filter" for a boolean, which has no "All".
    const alreadySet = selected.has(optionValue.toLowerCase());
    onValueChange(alreadySet && !offersAll ? '' : optionValue);
    onChosen();
  };

  function renderIndicator(checked: boolean) {
    if (multiple) {
      return (
        <Checkbox
          checked={checked}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none"
        />
      );
    }

    return (
      <Check
        className={cn('size-4', checked ? 'opacity-100' : 'opacity-0')}
        aria-hidden
      />
    );
  }

  function renderOption(option: (typeof options)[number]) {
    const checked = selected.has(option.value.toLowerCase());

    return (
      <CommandItem
        key={option.value}
        value={option.label}
        aria-checked={checked}
        onSelect={() =>
          multiple ? toggle(option.value) : choose(option.value)
        }
      >
        {renderIndicator(checked)}
        {/* Wraps anywhere: a URL or an id has no space to break at, and would
            otherwise run past the edge of the list and be cut off. */}
        <span className="wrap-anywhere">{option.label}</span>
      </CommandItem>
    );
  }

  return (
    // Without a search box nothing in the list takes focus, so the list itself
    // does: that is what keeps arrow keys and Enter working.
    <Command
      filter={containsEveryWord}
      tabIndex={field.searchable ? undefined : 0}
      className="outline-none"
    >
      {field.searchable ? (
        <CommandInput
          placeholder={labels.filterFieldPlaceholder.replace(
            '{{field}}',
            field.label,
          )}
        />
      ) : null}
      <CommandList>
        <CommandEmpty>{labels.noResult}</CommandEmpty>
        <CommandGroup>
          {offersAll ? (
            <CommandItem
              value={labels.all}
              aria-checked={selected.size === 0}
              onSelect={() => choose('')}
            >
              {renderIndicator(selected.size === 0)}
              <span>{labels.all}</span>
            </CommandItem>
          ) : null}
          {options.map(renderOption)}
        </CommandGroup>
        {!offersAll && selected.size > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value={labels.clearFilter}
                onSelect={() => onValueChange('')}
              >
                <span>{labels.clearFilter}</span>
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </Command>
  );
}
