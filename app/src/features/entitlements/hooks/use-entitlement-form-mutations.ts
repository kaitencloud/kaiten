import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PageEntitlement } from '@/api-client';
import {
  createEntitlementMutation,
  getEntitlementQueryKey,
  listEntitlementsQueryKey,
  updateEntitlementMutation,
} from '@/api-client/@tanstack/react-query.gen';

export function useEntitlementFormMutations() {
  const queryClient = useQueryClient();
  const entitlementsQueryKey = listEntitlementsQueryKey();

  const invalidateEntitlements = async () => {
    await queryClient.invalidateQueries({
      queryKey: entitlementsQueryKey,
    });
  };

  const createMutation = useMutation({
    ...createEntitlementMutation(),
    onSuccess: async (createdEntitlement) => {
      queryClient.setQueryData<PageEntitlement | undefined>(
        entitlementsQueryKey,
        (current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            items: [createdEntitlement, ...current.items],
          };
        },
      );
      await invalidateEntitlements();
    },
  });

  const updateMutation = useMutation({
    ...updateEntitlementMutation(),
    onSuccess: async (_response, variables) => {
      const { path } = variables;

      await Promise.all([
        invalidateEntitlements(),
        queryClient.invalidateQueries({
          queryKey: getEntitlementQueryKey({
            path: { entitlementSlug: path.entitlementSlug },
          }),
        }),
        queryClient.invalidateQueries({
          predicate: (query) => {
            const firstQueryKey = query.queryKey[0];

            return (
              typeof firstQueryKey === 'object' &&
              firstQueryKey !== null &&
              '_id' in firstQueryKey &&
              firstQueryKey._id === 'getLicenseEntitlements'
            );
          },
        }),
      ]);
    },
  });

  return {
    createMutation,
    updateMutation,
  };
}
