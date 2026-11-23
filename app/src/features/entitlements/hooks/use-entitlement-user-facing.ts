import { useCallback } from 'react';
import { toast } from 'sonner';
import type { Entitlement } from '@/api-client';
import { getEntitlementSlug, useCanPerform } from '@/domains/billing';
import { getApiErrorMessage } from '@/lib/errors';
import { entitlementToUpdateBody } from '../utils/entitlement-writable';
import { useEntitlementFormMutations } from './use-entitlement-form-mutations';

/**
 * Shows an entitlement in the customer-facing components, or takes it out, for a
 * screen that lists entitlements without owning them (the grants of a license).
 * The flag is the entitlement's own: it changes for every license that grants it.
 * Not optimistic: the switch shows what the API answered, and a refusal is said
 * in a toast, since a switch has no form to show it in.
 */
export function useEntitlementUserFacing() {
  const allowed = useCanPerform('entitlement.update');
  const {
    updateMutation: { isPending, mutate },
  } = useEntitlementFormMutations();

  const setUserFacing = useCallback(
    (entitlement: Entitlement, userFacing: boolean) => {
      // The update replaces the entitlement as a whole: it is read again and
      // only the flag is put on top of it (see `saveEntitlementOnFresh`).
      mutate(
        {
          edited: entitlementToUpdateBody(entitlement, { userFacing }),
          entitlementSlug: getEntitlementSlug(entitlement),
          opened: entitlementToUpdateBody(entitlement),
        },
        { onError: (error) => toast.error(getApiErrorMessage(error)) },
      );
    },
    [mutate],
  );

  return { allowed, isPending, setUserFacing };
}
