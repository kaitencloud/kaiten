import { Check } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxPanel,
  ComboboxSearch,
  ComboboxSeparator,
} from '@/components/ui/combobox';
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
 * typed, in any order. A fuzzy matcher keeps any option holding the typed
 * letters in order, which on URLs and event names keeps nearly all of them.
 */
function containsEveryWord(value: string, search: string): boolean {
  const option = value.toLowerCase();
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);

  return words.every((word) => option.includes(word));
}

/**
 * The check beside an option of a list of several choices. It only draws what the
 * option's own `aria-checked` says: a checkbox inside an option would nest one
 * control in another, which a screen reader cannot announce.
 */
function CheckMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'border-input dark:bg-input/30 flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs',
        checked &&
          'bg-primary text-primary-foreground dark:bg-primary border-primary',
      )}
    >
      {checked ? <Check className="size-3.5" /> : null}
    </span>
  );
}

/** A row of the list: an option, "All", or the "Clear filter" entry of the foot. */
type FilterEntry = {
  kind: 'option' | 'all' | 'clear';
  value: string;
  label: string;
};

type FilterEntryGroup = { value: string; items: FilterEntry[] };

/**
 * The editor of a field filtered by picking from a list (see hasOptionList):
 * the list itself, with nothing in front of it.
 *
 * - enum_list: several choices; each toggles, and the list stays open.
 * - enum: one choice, or "All"; picking closes the list.
 * - boolean: true or false, and no "All" -- a yes/no filter is either set or
 *   not. Picking the set value again clears it, and so does "Clear filter".
 *
 * Built on the same combobox as the "Filter" button's field picker, so both
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
  const [search, setSearch] = useState('');
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
      return <CheckMark checked={checked} />;
    }

    return (
      <Check
        className={cn('size-4', checked ? 'opacity-100' : 'opacity-0')}
        aria-hidden
      />
    );
  }

  const showClear = !offersAll && selected.size > 0;
  const groups: FilterEntryGroup[] = [
    {
      value: 'options',
      items: [
        ...(offersAll
          ? [{ kind: 'all' as const, value: '', label: labels.all }]
          : []),
        ...options.map((option) => ({
          kind: 'option' as const,
          value: option.value,
          label: option.label,
        })),
      ],
    },
    ...(showClear
      ? [
          {
            value: 'foot',
            items: [
              {
                kind: 'clear' as const,
                value: '',
                label: labels.clearFilter,
              },
            ],
          },
        ]
      : []),
  ];

  function handleSelect(entry: FilterEntry | null) {
    if (!entry) {
      return;
    }

    if (entry.kind === 'clear') {
      onValueChange('');
    } else if (entry.kind === 'all' || !multiple) {
      choose(entry.value);
    } else {
      toggle(entry.value);
    }
  }

  function renderEntry(entry: FilterEntry) {
    if (entry.kind === 'clear') {
      return (
        <ComboboxItem key="clear" value={entry}>
          <span>{entry.label}</span>
        </ComboboxItem>
      );
    }

    const checked =
      entry.kind === 'all'
        ? selected.size === 0
        : selected.has(entry.value.toLowerCase());

    return (
      <ComboboxItem
        key={entry.kind + entry.value}
        value={entry}
        aria-checked={checked}
      >
        {renderIndicator(checked)}
        {/* Wraps anywhere: a URL or an id has no space to break at, and would
            otherwise run past the edge of the list and be cut off. */}
        <span className="wrap-anywhere">{entry.label}</span>
      </ComboboxItem>
    );
  }

  return (
    <ComboboxPanel<FilterEntry>
      items={groups}
      value={null}
      filter={(entry, query) => containsEveryWord(entry.label, query)}
      itemToStringLabel={(entry) => entry.label}
      inputValue={search}
      onInputValueChange={(nextSearch, details) => {
        if (details.reason === 'input-change') {
          setSearch(nextSearch);
        }
      }}
      onValueChange={handleSelect}
    >
      {field.searchable ? (
        <ComboboxSearch
          placeholder={labels.filterFieldPlaceholder.replace(
            '{{field}}',
            field.label,
          )}
        />
      ) : null}
      <ComboboxEmpty>{labels.noResult}</ComboboxEmpty>
      {/* Without a search box nothing in the list takes focus, so the list
          itself does: that is what keeps arrow keys and Enter working. It is
          named after the field, since nothing else says what it lists. */}
      <ComboboxList
        aria-label={field.label}
        tabIndex={field.searchable ? undefined : 0}
        className="outline-none"
      >
        {(group: FilterEntryGroup, index: number) => (
          <Fragment key={group.value}>
            {index > 0 && search === '' ? <ComboboxSeparator /> : null}
            <ComboboxGroup items={group.items}>
              <ComboboxCollection>{renderEntry}</ComboboxCollection>
            </ComboboxGroup>
          </Fragment>
        )}
      </ComboboxList>
    </ComboboxPanel>
  );
}
