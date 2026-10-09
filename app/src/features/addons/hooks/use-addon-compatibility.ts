import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  removeAddonCompatibilityMutation,
  setAddonCompatibilityMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { getApiErrorMessage } from '@/lib/errors';
import { invalidateAddonCompatibilityQueries } from '../queries';

/**
 * Declares a version compatible with a license family, or takes the declaration
 * back. Both calls are idempotent -- the API answers 204 whether or not the family
 * was already in the state asked for -- so a checkbox simply says what it wants. The
 * box shows what the API holds, not what was clicked, and is off while its family has
 * a request on the way, so that a click made again at once sends nothing more: a
 * family has at most one request in flight, and the one that settles is the last
 * state asked for. A refusal is said in the API's own words in a toast, since a
 * checkbox has no form to show it in.
 */
export function useAddonCompatibility(addonSlug: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(new Set());
  const set = useMutation(setAddonCompatibilityMutation());
  const remove = useMutation(removeAddonCompatibilityMutation());

  const settle = (familySlug: string) =>
    setInFlight((current) => {
      const next = new Set(current);
      next.delete(familySlug);

      return next;
    });

  const declare = async (familySlug: string, compatible: boolean) => {
    setInFlight((current) => new Set(current).add(familySlug));
    try {
      const request = { path: { addonSlug, familySlug } };
      await (compatible
        ? set.mutateAsync(request)
        : remove.mutateAsync(request));
      await invalidateAddonCompatibilityQueries(queryClient, addonSlug);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t));
    } finally {
      settle(familySlug);
    }
  };

  return { declare, isBusy: (familySlug: string) => inFlight.has(familySlug) };
}
