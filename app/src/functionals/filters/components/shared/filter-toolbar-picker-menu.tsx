import { Filter } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useFilterToolbarContext } from '../toolbar/filter-toolbar-provider';
import { getFieldIcon } from './filter-toolbar-utils';

export function FilterPickerMenu() {
  const {
    controller,
    labels: copy,
    hasAvailableNormalFilters,
    canAddAdvancedFilter,
    handleSelectFilter,
    handleOpenAdvancedFromMenu,
  } = useFilterToolbarContext<unknown>();

  function renderAvailableField(
    field: (typeof controller.normal.availableFields)[number],
  ) {
    const Icon = getFieldIcon(field.type);

    return (
      <CommandItem key={field.id} onSelect={() => handleSelectFilter(field.id)}>
        <Icon className="size-4" />
        <span>{field.label}</span>
      </CommandItem>
    );
  }

  return (
    <Command>
      <CommandInput placeholder={copy.searchFilterBy} />
      <CommandList>
        <CommandEmpty>{copy.noResult}</CommandEmpty>
        <CommandGroup heading={copy.filterGroup}>
          {controller.normal.availableFields.map(renderAvailableField)}
          {!hasAvailableNormalFilters && !canAddAdvancedFilter ? (
            <CommandItem disabled>{copy.noFilterAvailable}</CommandItem>
          ) : null}
        </CommandGroup>
        {canAddAdvancedFilter ? (
          <>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem onSelect={handleOpenAdvancedFromMenu}>
                <Filter className="size-4" />
                <span>{copy.advancedFilter}</span>
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </Command>
  );
}
