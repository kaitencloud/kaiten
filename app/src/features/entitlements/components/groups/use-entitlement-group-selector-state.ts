import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import { useEntitlementGroupFormMutations } from '../../hooks';
import { entitlementGroupsQueryOptions } from '../../queries';

export type ResolvedEntitlementGroup = {
  name: string;
  slug: string;
};

type UseEntitlementGroupSelectorStateParams = {
  disabled: boolean;
  onChange: (groupSlugs: string[]) => void;
  onOpenChange?: (nextOpen: boolean) => void;
  onSelectionResolvedChange?: (groups: ResolvedEntitlementGroup[]) => void;
  open?: boolean;
  value: string[];
};

const normalizeQuery = (value: string) => value.trim().toLowerCase();

const toggleGroupSelection = (groupSlugs: string[], groupSlug: string) =>
  groupSlugs.includes(groupSlug)
    ? groupSlugs.filter((value) => value !== groupSlug)
    : [...groupSlugs, groupSlug];

function mergeGroupsBySlug(
  queriedGroups: Array<{ name: string; slug?: string }> = [],
  recentlyCreatedGroups: ResolvedEntitlementGroup[],
) {
  const groupsBySlug = new Map<string, ResolvedEntitlementGroup>();

  for (const group of recentlyCreatedGroups) {
    groupsBySlug.set(group.slug, group);
  }

  for (const group of queriedGroups) {
    if (!group.slug) {
      continue;
    }

    groupsBySlug.set(group.slug, {
      name: group.name,
      slug: group.slug,
    });
  }

  return [...groupsBySlug.values()];
}

export function useEntitlementGroupSelectorState({
  disabled,
  onChange,
  onOpenChange,
  onSelectionResolvedChange,
  open,
  value,
}: UseEntitlementGroupSelectorStateParams) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [recentlyCreatedGroups, setRecentlyCreatedGroups] = useState<
    ResolvedEntitlementGroup[]
  >([]);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: entitlementGroupsData } = useQuery(
    entitlementGroupsQueryOptions,
  );
  const { createMutation } = useEntitlementGroupFormMutations();
  const isCreatingGroup = createMutation.isPending;
  const isOpen = open ?? internalIsOpen;
  const groups = useMemo(
    () =>
      mergeGroupsBySlug(
        entitlementGroupsData?.items ?? [],
        recentlyCreatedGroups,
      ),
    [entitlementGroupsData, recentlyCreatedGroups],
  );
  const normalizedSearchQuery = normalizeQuery(searchQuery);
  const filteredGroups = useMemo(() => {
    if (!normalizedSearchQuery) {
      return groups;
    }

    return groups.filter((group) =>
      [group.name, group.slug].some((searchableValue) =>
        searchableValue.toLowerCase().includes(normalizedSearchQuery),
      ),
    );
  }, [groups, normalizedSearchQuery]);
  const selectedGroups = useMemo(() => {
    const groupsBySlug = new Map(groups.map((group) => [group.slug, group]));

    return value.map((groupSlug) => {
      const matchingGroup = groupsBySlug.get(groupSlug);

      return {
        name: matchingGroup?.name ?? groupSlug,
        slug: groupSlug,
      };
    });
  }, [groups, value]);
  const canCreateGroup =
    normalizedSearchQuery.length > 0 && filteredGroups.length === 0;

  useEffect(() => {
    onSelectionResolvedChange?.(selectedGroups);
  }, [onSelectionResolvedChange, selectedGroups]);

  function handleOpenChange(nextOpen: boolean) {
    if (disabled) {
      setInternalIsOpen(false);
      onOpenChange?.(false);
      return;
    }

    if (!nextOpen) {
      setSearchQuery('');
    }

    if (open === undefined) {
      setInternalIsOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  }

  async function handleCreateGroup() {
    const groupName = searchQuery.trim();
    if (!groupName || isCreatingGroup) {
      return;
    }

    try {
      const createdGroup = await createMutation.mutateAsync({
        body: {
          description: '',
          name: groupName,
        },
      });

      if (createdGroup.slug) {
        const createdGroupSlug = createdGroup.slug;

        setRecentlyCreatedGroups((currentGroups) => [
          ...currentGroups.filter((group) => group.slug !== createdGroupSlug),
          {
            name: createdGroup.name,
            slug: createdGroupSlug,
          },
        ]);
        onChange(toggleGroupSelection(value, createdGroupSlug));
      }

      handleOpenChange(false);
      setSearchQuery('');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  return {
    canCreateGroup,
    filteredGroups,
    handleCreateGroup,
    handleOpenChange,
    handleRemoveGroup(groupSlug: string) {
      onChange(value.filter((valueGroupSlug) => valueGroupSlug !== groupSlug));
    },
    handleToggleGroup(groupSlug: string) {
      onChange(toggleGroupSelection(value, groupSlug));
    },
    isCreatingGroup,
    isOpen,
    searchQuery,
    selectedGroups,
    setSearchQuery,
  };
}
