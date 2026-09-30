import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react';
import {
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type Ref,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { getComboboxTriggerClassName } from '@/components/combobox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import type { ResolvedEntitlementGroup } from './use-entitlement-group-selector-state';

export function SelectedGroupsValue({
  className,
  'aria-controls': ariaControls,
  disabled,
  isCreatingGroup,
  isInlineInteraction,
  isOpen,
  onRemoveGroup,
  selectedGroups,
  ref,
  ...props
}: {
  className?: string;
  disabled: boolean;
  isCreatingGroup: boolean;
  isInlineInteraction: boolean;
  isOpen: boolean;
  onRemoveGroup: (groupSlug: string) => void;
  selectedGroups: ResolvedEntitlementGroup[];
  ref?: Ref<HTMLDivElement>;
} & ComponentPropsWithoutRef<'div'>) {
  const { t } = useTranslation();

  return (
    <div
      ref={ref}
      {...props}
      role="combobox"
      aria-controls={ariaControls}
      tabIndex={disabled || isInlineInteraction ? -1 : 0}
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-disabled={disabled}
      className={cn(
        getComboboxTriggerClassName({
          hasValue: selectedGroups.length > 0,
          multiLine: true,
        }),
        'relative cursor-text focus-visible:ring-0',
        isOpen && 'border-ring ring-ring/50 ring-[3px]',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        if (isInlineInteraction) {
          event.preventDefault();
        }
      }}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 pr-6">
        {selectedGroups.length > 0 ? (
          selectedGroups.map((group) => (
            <Badge
              key={group.slug}
              variant="secondary"
              className="max-w-full gap-1 rounded-sm px-2 py-1 text-xs"
            >
              <span className="truncate">{group.name}</span>
              <button
                type="button"
                className="rounded-sm p-0.5 transition-colors hover:bg-background/80"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemoveGroup(group.slug);
                }}
                disabled={isCreatingGroup}
                aria-label={t(
                  'Pages.Entitlements.Mutation.Form.Actions.removeGroup',
                  { name: group.name },
                )}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">
            {t('Pages.Entitlements.Mutation.Form.Placeholders.groups')}
          </span>
        )}
      </div>
      <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
    </div>
  );
}

export function EntitlementGroupCommandList({
  listboxId,
  autoFocusSearch,
  canCreateGroup,
  filteredGroups,
  handleCreateGroup,
  handleToggleGroup,
  isCreatingGroup,
  isOpen,
  searchInputRef,
  searchQuery,
  setSearchQuery,
  value,
}: {
  listboxId: string;
  autoFocusSearch: boolean;
  canCreateGroup: boolean;
  filteredGroups: ResolvedEntitlementGroup[];
  handleCreateGroup: () => Promise<void>;
  handleToggleGroup: (groupSlug: string) => void;
  isCreatingGroup: boolean;
  isOpen: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  value: string[];
}) {
  const { t } = useTranslation();

  return (
    <Command
      shouldFilter={false}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && canCreateGroup && !isCreatingGroup) {
          event.preventDefault();
          event.stopPropagation();
          void handleCreateGroup();
        }
      }}
    >
      <div className="relative">
        <CommandInput
          ref={searchInputRef}
          autoFocus={autoFocusSearch && isOpen}
          value={searchQuery}
          onValueChange={setSearchQuery}
          disabled={isCreatingGroup}
          aria-busy={isCreatingGroup}
          className={cn(isCreatingGroup && 'pr-8')}
          placeholder={t(
            'Pages.Entitlements.Mutation.Form.Placeholders.groupSearch',
          )}
        />
        {isCreatingGroup ? (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      <CommandList id={listboxId}>
        <CommandEmpty>
          {t('Pages.Entitlements.Mutation.Form.Empty.noGroupResults')}
        </CommandEmpty>
        {filteredGroups.length > 0 ? (
          <CommandGroup>
            {filteredGroups.map((group) => {
              const isSelected = value.includes(group.slug);

              return (
                <CommandItem
                  key={group.slug}
                  value={group.slug}
                  onSelect={() => handleToggleGroup(group.slug)}
                  disabled={isCreatingGroup}
                >
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      isSelected ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{group.name}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}
        {canCreateGroup ? (
          <CommandGroup>
            <CommandItem
              onSelect={() => void handleCreateGroup()}
              disabled={isCreatingGroup}
            >
              {isCreatingGroup ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              {t(
                isCreatingGroup
                  ? 'Pages.Entitlements.Mutation.Form.Actions.creatingGroup'
                  : 'Pages.Entitlements.Mutation.Form.Actions.createGroup',
                {
                  name: searchQuery.trim(),
                },
              )}
            </CommandItem>
          </CommandGroup>
        ) : null}
      </CommandList>
    </Command>
  );
}
