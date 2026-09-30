import { Button, buttonVariants } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModal } from '@/hooks/use-modal';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';

export type ComboboxProps<TOption = unknown> = {
  disabled?: boolean;
  placeholder?: string;
  description?: string;
  searchPlaceholder: string;
  options: TOption[];
  value?: string;
  onSelect: (value: string) => void;
  getOptionLabel: (option: TOption) => string;
  getOptionValue: (option: TOption) => string;
  /**
   * When true, a free-form value typed in the search box can be committed as
   * the selected value (creatable combobox). The provided options act as
   * suggestions rather than an exhaustive list.
   */
  allowCustomValue?: boolean;
  /**
   * When true, a selected value can be taken back to the empty string.
   * Selecting an option is otherwise one-way: the list only offers other
   * options, so a field that is genuinely optional has no way back to "none"
   * once the user has picked something.
   *
   * Opt-in: on a required field the entry would offer a state the form
   * refuses anyway.
   */
  clearable?: boolean;
  /** Label of the clear entry. Defaults to the shared "None" translation. */
  clearLabel?: string;
};

export const getComboboxTriggerClassName = ({
  hasValue = true,
  multiLine = false,
}: {
  hasValue?: boolean;
  multiLine?: boolean;
} = {}) =>
  cn(
    buttonVariants({ size: 'default', variant: 'outline' }),
    'w-full justify-between',
    !hasValue && 'text-muted-foreground',
    multiLine &&
      'h-auto min-h-9 flex-wrap justify-start whitespace-normal px-3 py-1.5 text-left',
  );

export const Combobox = <TOption,>({
  disabled = false,
  placeholder,
  searchPlaceholder,
  options,
  value,
  onSelect,
  getOptionLabel,
  getOptionValue,
  allowCustomValue = false,
  clearable = false,
  clearLabel,
}: ComboboxProps<TOption>) => {
  const { t } = useTranslation();
  const { isOpen, open, close } = useModal();
  const [search, setSearch] = useState('');

  const handleSelect = (nextValue: string) => {
    onSelect(nextValue);
    setSearch('');
    close();
  };

  const selectedOption = value
    ? options.find((option) => getOptionValue(option) === value)
    : undefined;
  const displayValue = selectedOption
    ? getOptionLabel(selectedOption)
    : value || placeholder;

  // Nothing to clear when nothing is selected, so the entry only appears once
  // the field holds a value.
  const showClearOption = clearable && Boolean(value);

  const trimmedSearch = search.trim();
  const showCreateOption =
    allowCustomValue &&
    trimmedSearch !== '' &&
    !options.some((option) => getOptionValue(option) === trimmedSearch);

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) {
      close();
      return;
    }

    if (!nextOpen) {
      setSearch('');
      close();
    } else {
      open();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className={getComboboxTriggerClassName({
            hasValue: Boolean(value),
          })}
        >
          {displayValue}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 popover-content-full-width" align="start">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandEmpty>{t('Common.noResults')}</CommandEmpty>
          <CommandGroup>
            <CommandList>
              {showClearOption && (
                <CommandItem
                  key="__clear__"
                  value="__clear__"
                  keywords={[clearLabel ?? t('Common.none', 'None')]}
                  onSelect={() => handleSelect('')}
                >
                  <X className="mr-2 h-4 w-4" />
                  {clearLabel ?? t('Common.none', 'None')}
                </CommandItem>
              )}
              {options.map((option) => {
                const optionLabel = getOptionLabel(option);
                const optionValue = getOptionValue(option);

                return (
                  <CommandItem
                    key={optionValue}
                    value={optionValue}
                    keywords={[optionLabel]}
                    onSelect={handleSelect}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        optionValue === value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {optionLabel}
                  </CommandItem>
                );
              })}
              {showCreateOption && (
                <CommandItem
                  key={`__create__${trimmedSearch}`}
                  value={trimmedSearch}
                  onSelect={() => handleSelect(trimmedSearch)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('Common.useValue', { value: trimmedSearch })}
                </CommandItem>
              )}
            </CommandList>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
