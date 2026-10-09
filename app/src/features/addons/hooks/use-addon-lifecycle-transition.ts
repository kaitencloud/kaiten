import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Addon } from '@/api-client';
import { archiveAddon, publishAddon, unarchiveAddon } from '@/api-client';
import { getAddonQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { getApiErrorMessage } from '@/lib/errors';
import { invalidateAddonQueries } from '../queries';
import { TRANSITION_KEYS } from '../utils/addon-labels';
import {
  type AddonLifecycleTransition,
  getLifecycleTransition,
} from '../utils/addon-lifecycle.utils';

export type TransitionVariables = {
  addonSlug: string;
  transition: AddonLifecycleTransition;
};

// One operation per transition: the API moves a version's state only through
// these, never through an update.
async function requestTransition({
  addonSlug,
  transition,
}: TransitionVariables): Promise<Addon> {
  const options = { path: { addonSlug }, throwOnError: true } as const;

  switch (transition) {
    case 'publish':
      return (await publishAddon(options)).data;
    case 'archive':
      return (await archiveAddon(options)).data;
    case 'unarchive':
      return (await unarchiveAddon(options)).data;
  }
}

/**
 * Moves a version along the one transition its current state accepts. The transition
 * travels with the request, so the toast names what was asked for even once the
 * refetched version has moved on to its next state.
 *
 * `run` takes the transition a confirmation was opened for, when there is one: a
 * refetch while it is open must not change what "confirm" does. If the version moved
 * meanwhile, the API refuses the stale transition and says why.
 */
export function useAddonLifecycleTransition(
  addon: Pick<Addon, 'lifecycleState' | 'slug'>,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const transition = getLifecycleTransition(addon);
  const addonSlug = addon.slug;

  const mutation = useMutation({
    mutationFn: requestTransition,
    // The API answers with the moved version: that is the detail, as is. Only the
    // lists showing it are refetched; its grants and its prices did not change.
    onSuccess: (moved, variables) => {
      queryClient.setQueryData(
        getAddonQueryKey({ path: { addonSlug: variables.addonSlug } }),
        moved,
      );
      toast.success(t(TRANSITION_KEYS[variables.transition].success));
    },
    // The API says why it refused -- a draft cannot be archived, the default cannot
    // be withdrawn -- and that reason is what the vendor needs. A refusal usually
    // means the version moved meanwhile, so its detail is refetched too.
    onError: async (error, variables) => {
      toast.error(getApiErrorMessage(error, t));
      await queryClient.invalidateQueries({
        queryKey: getAddonQueryKey({
          path: { addonSlug: variables.addonSlug },
        }),
      });
    },
    onSettled: async () => {
      await invalidateAddonQueries(queryClient);
    },
  });
  const { isPending, mutate } = mutation;

  const run = useCallback(
    (target?: TransitionVariables) => {
      if (target) {
        mutate(target);

        return;
      }
      mutate({ addonSlug, transition });
    },
    [addonSlug, mutate, transition],
  );

  return { isPending, run, transition };
}
