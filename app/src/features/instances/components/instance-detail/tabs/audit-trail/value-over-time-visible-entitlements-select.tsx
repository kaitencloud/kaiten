import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import type { AuditTrailEntitlementOption } from './audit-trail.utils';

type ValueOverTimeVisibleEntitlementsSelectProps = {
  ariaLabel: string;
  onChange: (value: string[]) => void;
  onClear: () => void;
  onSelectAll: () => void;
  options: AuditTrailEntitlementOption[];
  value: string[];
};

const normalizeQuery = (value: string) => value.trim().toLowerCase();

const toggleSelectedEntitlement = (
  selectedEntitlements: string[],
  entitlementSlug: string,
) =>
  selectedEntitlements.includes(entitlementSlug)
    ? selectedEntitlements.filter((value) => value !== entitlementSlug)
    : [...selectedEntitlements, entitlementSlug];

export function ValueOverTimeVisibleEntitlementsSelect({
  ariaLabel,
  onChange,
  onClear,
  onSelectAll,
  options,
  value,
}: ValueOverTimeVisibleEntitlementsSelectProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(() => {
    const normalizedSearchQuery = normalizeQuery(searchQuery);

    if (!normalizedSearchQuery) {
      return options;
    }

    return options.filter((option) =>
      [option.label, option.slug].some((searchableValue) =>
        searchableValue.toLowerCase().includes(normalizedSearchQuery),
      ),
    );
  }, [options, searchQuery]);

  const selectedOptions = useMemo(
    () => options.filter((option) => value.includes(option.slug)),
    [options, value],
  );

  const triggerLabel = useMemo(() => {
    if (selectedOptions.length === options.length && options.length > 0) {
      return t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.allEntitlements',
      );
    }

    return t(
      'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.visibleEntitlementsCount',
      {
        count: selectedOptions.length,
      },
    );
  }, [options.length, selectedOptions.length, t]);

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
              'min-w-0',
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
      <PopoverContent className="popover-content-full-width p-0" align="start">
        <ComboboxPanel<AuditTrailEntitlementOption>
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
              onChange(toggleSelectedEntitlement(value, option.slug));
            }
          }}
        >
          <ComboboxSearch
            autoFocus={isOpen}
            placeholder={t(
              'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.visibleEntitlementsSearchPlaceholder',
            )}
          />
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-0 py-0 text-xs"
              onClick={onSelectAll}
            >
              {t(
                'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.selectAll',
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-0 py-0 text-xs"
              onClick={onClear}
            >
              {t(
                'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.clearIndividualLines',
              )}
            </Button>
          </div>
          <ComboboxEmpty>
            {t(
              'Pages.Customers.Instances.Detail.auditTrail.charts.valueOverTime.visibleEntitlementsEmpty',
            )}
          </ComboboxEmpty>
          <ComboboxList className="p-1 empty:p-0">
            {(option: AuditTrailEntitlementOption) => {
              const isSelected = value.includes(option.slug);

              return (
                <ComboboxItem key={option.slug} value={option}>
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
