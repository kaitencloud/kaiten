import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useEffect, useId, useRef } from 'react';
import {
  EntitlementGroupCommandList,
  SelectedGroupsValue,
} from './entitlement-group-selector-parts';
import {
  type ResolvedEntitlementGroup,
  useEntitlementGroupSelectorState,
} from './use-entitlement-group-selector-state';

const EMPTY_VALUE: string[] = [];

type EntitlementGroupSelectorProps = {
  autoFocusSearch?: boolean;
  disabled?: boolean;
  interactionMode?: 'default' | 'inline';
  onOpenChange?: (nextOpen: boolean) => void;
  onSelectionResolvedChange?: (groups: ResolvedEntitlementGroup[]) => void;
  onChange: (groupSlugs: string[]) => void;
  open?: boolean;
  value?: string[];
};

export function EntitlementGroupSelector({
  autoFocusSearch = false,
  disabled = false,
  interactionMode = 'default',
  onOpenChange,
  onSelectionResolvedChange,
  onChange,
  open,
  value = EMPTY_VALUE,
}: EntitlementGroupSelectorProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const isInlineInteraction = interactionMode === 'inline';
  const state = useEntitlementGroupSelectorState({
    disabled,
    onChange,
    onOpenChange,
    onSelectionResolvedChange,
    open,
    value,
  });

  useEffect(() => {
    if (!autoFocusSearch || !state.isOpen) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [autoFocusSearch, state.isOpen]);

  return (
    <div>
      <Popover
        open={state.isOpen}
        onOpenChange={(nextOpen, details) => {
          const target = details.event.target;
          if (
            !nextOpen &&
            isInlineInteraction &&
            target instanceof Node &&
            anchorRef.current?.contains(target)
          ) {
            details.cancel();
            searchInputRef.current?.focus();
            return;
          }
          state.handleOpenChange(nextOpen);
        }}
      >
        {isInlineInteraction ? (
          <SelectedGroupsValue
            ref={anchorRef}
            aria-controls={listboxId}
            disabled={disabled}
            isCreatingGroup={state.isCreatingGroup}
            isInlineInteraction
            isOpen={state.isOpen}
            onRemoveGroup={state.handleRemoveGroup}
            selectedGroups={state.selectedGroups}
          />
        ) : (
          <PopoverTrigger
            nativeButton={false}
            render={
              <SelectedGroupsValue
                ref={anchorRef}
                aria-controls={listboxId}
                disabled={disabled}
                isCreatingGroup={state.isCreatingGroup}
                isInlineInteraction={false}
                isOpen={state.isOpen}
                onRemoveGroup={state.handleRemoveGroup}
                selectedGroups={state.selectedGroups}
              />
            }
          />
        )}
        <PopoverContent
          className="popover-content-full-width p-0"
          align="start"
          anchor={anchorRef}
          initialFocus={autoFocusSearch ? searchInputRef : undefined}
        >
          <EntitlementGroupCommandList
            listboxId={listboxId}
            autoFocusSearch={autoFocusSearch}
            canCreateGroup={state.canCreateGroup}
            filteredGroups={state.filteredGroups}
            handleCreateGroup={state.handleCreateGroup}
            handleToggleGroup={state.handleToggleGroup}
            isCreatingGroup={state.isCreatingGroup}
            isOpen={state.isOpen}
            searchInputRef={searchInputRef}
            searchQuery={state.searchQuery}
            setSearchQuery={state.setSearchQuery}
            value={value}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
