import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PageEntitlementGroup } from '@/api-client';
import {
  createEntitlementGroupMutation,
  deleteEntitlementGroupMutation,
  listEntitlementGroupsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { saveEntitlementGroupOnFresh } from '../queries/entitlement-group-save';

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
    mutationFn: saveEntitlementGroupOnFresh,
    // What the update sent, merged with the group as the API held it.
    onSuccess: async (sent, variables) => {
      const { entitlementGroupSlug } = variables;
      queryClient.setQueryData<PageEntitlementGroup | undefined>(
        groupsQueryKey,
        (current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            items: current.items.map((group) =>
              group.slug === entitlementGroupSlug
                ? { ...group, ...sent }
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
