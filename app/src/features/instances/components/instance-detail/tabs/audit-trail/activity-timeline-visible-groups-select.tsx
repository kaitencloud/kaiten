import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getComboboxTriggerClassName } from '@/components/combobox';
import {
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPanel,
  ComboboxSearch,
} from '@/components/ui/combobox';
import type { InstanceEntitlementGroupOption } from '../../../../utils/instance-detail-entitlements.utils';
import { cn } from '@/lib/utils';

type ActivityTimelineVisibleGroupsSelectProps = {
  ariaLabel: string;
  className?: string;
  onChange: (value: string[]) => void;
  options: InstanceEntitlementGroupOption[];
  triggerClassName?: string;
  value: string[];
};

const normalizeQuery = (value: string) => value.trim().toLowerCase();

const toggleSelectedGroup = (selectedGroups: string[], groupSlug: string) =>
  selectedGroups.includes(groupSlug)
    ? selectedGroups.filter((value) => value !== groupSlug)
    : [...selectedGroups, groupSlug];

export function ActivityTimelineVisibleGroupsSelect({
  ariaLabel,
  className,
  onChange,
  options,
  triggerClassName,
  value,
}: ActivityTimelineVisibleGroupsSelectProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(() => {
    const normalizedSearchQuery = normalizeQuery(searchQuery);

    if (!normalizedSearchQuery) {
      return options;
    }

    return options.filter((option) =>
      [option.label, option.value].some((searchableValue) =>
        searchableValue.toLowerCase().includes(normalizedSearchQuery),
      ),
    );
  }, [options, searchQuery]);

  const selectedOptions = useMemo(
    () => options.filter((option) => value.includes(option.value)),
    [options, value],
  );

  const triggerLabel = useMemo(() => {
    if (selectedOptions.length === 0) {
      return t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.visibleGroupsPlaceholder',
      );
    }

    if (selectedOptions.length === options.length && options.length > 0) {
      return t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.allGroups',
      );
    }

    if (selectedOptions.length === 1) {
      return selectedOptions[0]?.label;
    }

    return t(
      'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.visibleGroupsCount',
      {
        count: selectedOptions.length,
      },
    );
  }, [options.length, selectedOptions, t]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSearchQuery('');
    }

    setIsOpen(nextOpen);
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              getComboboxTriggerClassName({
                hasValue: selectedOptions.length > 0,
              }),
              triggerClassName,
            )}
            aria-label={ariaLabel}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            disabled={options.length === 0}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </button>
        }
      />
      <PopoverContent
        className={cn('popover-content-full-width p-0', className)}
        align="start"
      >
        <ComboboxPanel<InstanceEntitlementGroupOption>
          items={filteredOptions}
          value={null}
          filter={null}
          itemToStringLabel={(option) => option.label}
          inputValue={searchQuery}
          onInputValueChange={(nextSearchQuery, details) => {
            if (details.reason === 'input-change') {
              setSearchQuery(nextSearchQuery);
            }
          }}
          onValueChange={(option) => {
            if (option) {
              onChange(toggleSelectedGroup(value, option.value));
            }
          }}
        >
          <ComboboxSearch
            autoFocus={isOpen}
            placeholder={t(
              'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.visibleGroupsSearchPlaceholder',
            )}
          />
          <ComboboxEmpty>
            {t(
              'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.visibleGroupsEmpty',
            )}
          </ComboboxEmpty>
          <ComboboxList className="p-1 empty:p-0">
            {(option: InstanceEntitlementGroupOption) => {
              const isSelected = value.includes(option.value);

              return (
                <ComboboxItem key={option.value} value={option}>
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      isSelected ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxPanel>
      </PopoverContent>
    </Popover>
  );
}
