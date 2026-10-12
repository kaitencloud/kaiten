import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  attachInstanceAddonMutation,
  detachInstanceAddonMutation,
  setInstanceAddonQuantityMutation,
} from '@/api-client/@tanstack/react-query.gen';
import {
  getProblemCode,
  invalidateInstanceAddonQueries,
} from '@/domains/billing';

// The refusals that say the screen is out of date: someone attached the family, or
// took the add-on off, after the list was read. Nothing was changed, and the list
// is read again so that it says what the instance holds now.
const OUT_OF_DATE_CODES = new Set([
  'AttachInstanceAddon.FamilyAlreadyAttached',
  'DetachInstanceAddon.NotAttached',
  'SetInstanceAddonQuantity.NotAttached',
]);

/**
 * Attaching an add-on to an instance, changing the quantity it holds and taking it
 * off. None is optimistic: the screen says what the API answered, and a refusal is
 * never shown as a change. A change applies to the entitlements at once, so it
 * refreshes the add-ons the instance holds, the effective values its entitlements
 * show and the invoice its next boundary will issue.
 */
export function useInstanceAddonMutations(instanceSlug: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    invalidateInstanceAddonQueries(queryClient, instanceSlug);
  const onError = (error: unknown) => {
    const code = getProblemCode(error);

    if (code && OUT_OF_DATE_CODES.has(code)) {
      void refresh();
    }
  };

  return {
    attach: useMutation({
      ...attachInstanceAddonMutation(),
      onError,
      onSuccess: refresh,
    }),
    detach: useMutation({
      ...detachInstanceAddonMutation(),
      onError,
      onSuccess: refresh,
    }),
    setQuantity: useMutation({
      ...setInstanceAddonQuantityMutation(),
      onError,
      onSuccess: refresh,
    }),
  };
}
