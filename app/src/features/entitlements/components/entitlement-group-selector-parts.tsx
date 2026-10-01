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
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxPanel,
  ComboboxSearch,
} from '@/components/ui/combobox';
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

/** A row of the list: an existing group, or the entry that creates the one being typed. */
type GroupEntry = {
  kind: 'group' | 'create';
  value: string;
  label: string;
};

type GroupEntryGroup = { value: string; items: GroupEntry[] };

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

  // The groups arrive already filtered by the search, so the list does not filter again.
  const groups: GroupEntryGroup[] = [
    ...(filteredGroups.length > 0
      ? [
          {
            value: 'groups',
            items: filteredGroups.map((group) => ({
              kind: 'group' as const,
              value: group.slug,
              label: group.name,
            })),
          },
        ]
      : []),
    ...(canCreateGroup
      ? [
          {
            value: 'create',
            items: [
              {
                kind: 'create' as const,
                value: searchQuery.trim(),
                label: t(
                  isCreatingGroup
                    ? 'Pages.Entitlements.Mutation.Form.Actions.creatingGroup'
                    : 'Pages.Entitlements.Mutation.Form.Actions.createGroup',
                  {
                    name: searchQuery.trim(),
                  },
                ),
              },
            ],
          },
        ]
      : []),
  ];

  function handleSelect(entry: GroupEntry | null) {
    if (entry?.kind === 'group') {
      handleToggleGroup(entry.value);
    } else if (entry?.kind === 'create') {
      void handleCreateGroup();
    }
  }

  function renderEntry(entry: GroupEntry) {
    if (entry.kind === 'create') {
      return (
        <ComboboxItem key="create" value={entry} disabled={isCreatingGroup}>
          {isCreatingGroup ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Plus className="mr-2 size-4" />
          )}
          {entry.label}
        </ComboboxItem>
      );
    }

    const isSelected = value.includes(entry.value);

    return (
      <ComboboxItem key={entry.value} value={entry} disabled={isCreatingGroup}>
        <Check
          className={cn(
            'mr-2 size-4',
            isSelected ? 'opacity-100' : 'opacity-0',
          )}
        />
        <span className="truncate">{entry.label}</span>
      </ComboboxItem>
    );
  }

  return (
    <ComboboxPanel<GroupEntry>
      items={groups}
      value={null}
      filter={null}
      itemToStringLabel={(entry) => entry.label}
      inputValue={searchQuery}
      onInputValueChange={(nextSearch, details) => {
        if (details.reason === 'input-change') {
          setSearchQuery(nextSearch);
        }
      }}
      onValueChange={handleSelect}
    >
      {/* Capture: Enter creates the group before the list takes it for a pick. */}
      <div
        onKeyDownCapture={(event) => {
          if (event.key === 'Enter' && canCreateGroup && !isCreatingGroup) {
            event.preventDefault();
            event.stopPropagation();
            void handleCreateGroup();
          }
        }}
      >
        <div className="relative">
          <ComboboxSearch
            ref={searchInputRef}
            autoFocus={autoFocusSearch && isOpen}
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
        <ComboboxEmpty>
          {t('Pages.Entitlements.Mutation.Form.Empty.noGroupResults')}
        </ComboboxEmpty>
        <ComboboxList id={listboxId}>
          {(group: GroupEntryGroup) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxCollection>{renderEntry}</ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </div>
    </ComboboxPanel>
  );
}
