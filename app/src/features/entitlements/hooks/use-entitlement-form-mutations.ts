import { useAiAccess, isAiEntitlement } from '@/domains/ai-credits';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PageEntitlement } from '@/api-client';
import {
  createEntitlementMutation,
  getEntitlementQueryKey,
  listEntitlementsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import {
  type SaveEntitlementVariables,
  saveEntitlementOnFresh,
} from '../queries/entitlement-save';

export function useEntitlementFormMutations() {
  const queryClient = useQueryClient();
  const access = useAiAccess();
  const create = createEntitlementMutation();
  const entitlementsQueryKey = listEntitlementsQueryKey();

  const invalidateEntitlements = async () => {
    await queryClient.invalidateQueries({
      queryKey: entitlementsQueryKey,
    });
  };

  const createMutation = useMutation({
    ...create,
    mutationFn: (variables, context) => {
      if (isAiEntitlement(variables.body.type) && !access.available)
        throw new Error('AIUsage.Disabled');
      return create.mutationFn!(variables, context);
    },
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
      // Not awaited: `mutateAsync` resolves after this callback, and a creation
      // that is recovered writes its tombstone when it resolves, before the page
      // goes. The list refetches in the background.
      void invalidateEntitlements();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (variables: SaveEntitlementVariables) =>
      saveEntitlementOnFresh(variables, access.available),
    onSuccess: async (_response, variables) => {
      const { entitlementSlug } = variables;

      await Promise.all([
        invalidateEntitlements(),
        queryClient.invalidateQueries({
          queryKey: getEntitlementQueryKey({
            path: { entitlementSlug },
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
