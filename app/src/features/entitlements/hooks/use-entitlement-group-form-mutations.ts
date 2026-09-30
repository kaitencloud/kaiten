import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PageEntitlementGroup } from '@/api-client';
import {
  createEntitlementGroupMutation,
  deleteEntitlementGroupMutation,
  listEntitlementGroupsQueryKey,
  updateEntitlementGroupMutation,
} from '@/api-client/@tanstack/react-query.gen';

export function useEntitlementGroupFormMutations() {
  const queryClient = useQueryClient();
  const groupsQueryKey = listEntitlementGroupsQueryKey();

  const invalidateGroups = async () => {
    await queryClient.invalidateQueries({
      queryKey: groupsQueryKey,
    });
  };

  const createMutation = useMutation({
    ...createEntitlementGroupMutation(),
    onSuccess: async (createdGroup) => {
      queryClient.setQueryData<PageEntitlementGroup | undefined>(
        groupsQueryKey,
        (current) => {
          if (!current) {
            return current;
          }
          return { ...current, items: [createdGroup, ...current.items] };
        },
      );
      await invalidateGroups();
    },
  });

  const updateMutation = useMutation({
    ...updateEntitlementGroupMutation(),
    onSuccess: async (_response, variables) => {
      const { path, body } = variables;
      queryClient.setQueryData<PageEntitlementGroup | undefined>(
        groupsQueryKey,
        (current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            items: current.items.map((group) =>
              group.slug === path.entitlementGroupSlug
                ? { ...group, ...body }
                : group,
            ),
          };
        },
      );
      await invalidateGroups();
    },
  });

  const deleteMutation = useMutation({
    ...deleteEntitlementGroupMutation(),
    onSuccess: async (_response, variables) => {
      const { path } = variables;
      queryClient.setQueryData<PageEntitlementGroup | undefined>(
        groupsQueryKey,
        (current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            items: current.items.filter(
              (group) => group.slug !== path.entitlementGroupSlug,
            ),
          };
        },
      );
      await invalidateGroups();
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
