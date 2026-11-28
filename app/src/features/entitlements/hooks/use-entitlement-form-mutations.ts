import { useAiAccess, isAiEntitlement } from '@/domains/ai-credits';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PageEntitlement } from '@/api-client';
import {
  createEntitlementMutation,
  getEntitlementQueryKey,
  getLicenseEntitlementsQueryKey,
  listEntitlementsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { isCombinedEntitlement } from '@/domains/entitlement-usage';
import {
  type SaveEntitlementVariables,
  saveEntitlementOnFresh,
} from '../queries/entitlement-save';
import { invalidateInstanceUsage } from '../queries/entitlement-usage-invalidation';

// The operation of a generated query key, which every cached call of it shares: the
// instance and the license are in the rest of the key, and a refresh wants them all.
const operationOf = (queryKey: readonly [{ _id: string }, ...unknown[]]) =>
  queryKey[0]._id;
const LICENSE_ENTITLEMENTS = operationOf(
  getLicenseEntitlementsQueryKey({ path: { licenseSlug: '' } }),
);

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

  const invalidateOperation = (operation: string) =>
    queryClient.invalidateQueries({
      predicate: (query) => {
        const firstQueryKey = query.queryKey[0];

        return (
          typeof firstQueryKey === 'object' &&
          firstQueryKey !== null &&
          '_id' in firstQueryKey &&
          firstQueryKey._id === operation
        );
      },
    });

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
      if (isCombinedEntitlement(createdEntitlement)) {
        void invalidateInstanceUsage(queryClient);
      }
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
        invalidateOperation(LICENSE_ENTITLEMENTS),
        // Saving the sources or a weight of a combined entitlement re-values the usage
        // and the limit every instance reads of it, the current window included.
        variables.edited.usageSource === 'COMBINED_USAGE'
          ? invalidateInstanceUsage(queryClient)
          : undefined,
      ]);
    },
  });

  return {
    createMutation,
    updateMutation,
  };
}
