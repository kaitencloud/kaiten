import { Filter } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Fragment, useState } from 'react';
import {
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxPanel,
  ComboboxSearch,
  ComboboxSeparator,
} from '@/components/ui/combobox';
import { useFilterToolbarContext } from '../toolbar/filter-toolbar-provider';
import { getFieldIcon } from './filter-toolbar-utils';

/** A row of the menu: a field to filter on, the "nothing available" note, or the advanced filter. */
type PickerEntry = {
  kind: 'field' | 'unavailable' | 'advanced';
  id: string;
  label: string;
  Icon?: LucideIcon;
};

type PickerEntryGroup = { value: string; items: PickerEntry[] };

export function FilterPickerMenu() {
  const {
    controller,
    labels: copy,
    hasAvailableNormalFilters,
    canAddAdvancedFilter,
    handleSelectFilter,
    handleOpenAdvancedFromMenu,
  } = useFilterToolbarContext<unknown>();
  const [search, setSearch] = useState('');

  const groups: PickerEntryGroup[] = [
    {
      value: 'fields',
      items: [
        ...controller.normal.availableFields.map((field) => ({
          kind: 'field' as const,
          id: field.id,
          label: field.label,
          Icon: getFieldIcon(field.type),
        })),
        ...(!hasAvailableNormalFilters && !canAddAdvancedFilter
          ? [
              {
                kind: 'unavailable' as const,
                id: 'unavailable',
                label: copy.noFilterAvailable,
              },
            ]
          : []),
      ],
    },
    ...(canAddAdvancedFilter
      ? [
          {
            value: 'advanced',
            items: [
              {
                kind: 'advanced' as const,
                id: 'advanced',
                label: copy.advancedFilter,
                Icon: Filter,
              },
            ],
          },
        ]
      : []),
  ];

  function handleSelect(entry: PickerEntry | null) {
    if (entry?.kind === 'field') {
      handleSelectFilter(entry.id);
    } else if (entry?.kind === 'advanced') {
      handleOpenAdvancedFromMenu();
    }
  }

  function renderEntry(entry: PickerEntry) {
    const Icon = entry.Icon;

    return (
      <ComboboxItem
        key={entry.id}
        value={entry}
        disabled={entry.kind === 'unavailable'}
      >
        {Icon ? <Icon className="size-4" /> : null}
        {entry.kind === 'unavailable' ? (
          entry.label
        ) : (
          <span>{entry.label}</span>
        )}
      </ComboboxItem>
    );
  }

  return (
    <ComboboxPanel<PickerEntry>
      items={groups}
      value={null}
      itemToStringLabel={(entry) => entry.label}
      inputValue={search}
      onInputValueChange={(nextSearch, details) => {
        if (details.reason === 'input-change') {
          setSearch(nextSearch);
        }
      }}
      onValueChange={handleSelect}
    >
      <ComboboxSearch placeholder={copy.searchFilterBy} />
      <ComboboxEmpty>{copy.noResult}</ComboboxEmpty>
      <ComboboxList>
        {(group: PickerEntryGroup, index: number) => (
          <Fragment key={group.value}>
            {index > 0 && search === '' ? <ComboboxSeparator /> : null}
            <ComboboxGroup items={group.items}>
              {index === 0 ? (
                <ComboboxLabel>{copy.filterGroup}</ComboboxLabel>
              ) : null}
              <ComboboxCollection>{renderEntry}</ComboboxCollection>
            </ComboboxGroup>
          </Fragment>
        )}
      </ComboboxList>
    </ComboboxPanel>
  );
}
