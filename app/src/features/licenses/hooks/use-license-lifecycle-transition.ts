import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { License } from '@/api-client';
import { archiveLicense, publishLicense, unarchiveLicense } from '@/api-client';
import { getLicenseQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { getApiErrorMessage } from '@/lib/errors';
import { invalidateLicenseLists } from '../queries';
import {
  getLifecycleTransition,
  type LicenseLifecycleTransition,
} from '../utils/license-lifecycle.utils';

export type TransitionVariables = {
  licenseSlug: string;
  transition: LicenseLifecycleTransition;
};

// One operation per transition: the API moves a version's state only through
// these, never through an update.
async function requestTransition({
  licenseSlug,
  transition,
}: TransitionVariables): Promise<License> {
  const options = { path: { licenseSlug }, throwOnError: true } as const;

  switch (transition) {
    case 'publish':
      return (await publishLicense(options)).data;
    case 'archive':
      return (await archiveLicense(options)).data;
    case 'unarchive':
      return (await unarchiveLicense(options)).data;
  }
}

// Moves a version along the one transition its current state accepts. The
// transition travels with the request, so the toast names what was asked for
// even once the refetched version has moved on to its next state.
//
// `run` takes the transition a confirmation was opened for, when there is one:
// a refetch while it is open must not change what "confirm" does. If the
// version moved meanwhile, the API refuses the stale transition and says why.
export function useLicenseLifecycleTransition(
  license: Pick<License, 'lifecycleState' | 'slug'>,
) {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });
  const transition = getLifecycleTransition(license);
  const licenseSlug = license.slug;

  const mutation = useMutation({
    mutationFn: requestTransition,
    // The API answers with the moved version: that is the detail, as is. Only
    // the lists showing it are refetched; its entitlements did not change.
    onSuccess: (moved, variables) => {
      queryClient.setQueryData(
        getLicenseQueryKey({ path: { licenseSlug: variables.licenseSlug } }),
        moved,
      );
      toast.success(
        t(`Pages.Licenses.LifecycleActions.${variables.transition}.success`),
      );
    },
    // The API says why it refused -- a draft cannot be archived, the default
    // cannot be withdrawn -- and that reason is what the vendor needs. A
    // refusal usually means the version moved meanwhile, so its detail is
    // refetched too.
    onError: async (error, variables) => {
      toast.error(getApiErrorMessage(error, t));
      await queryClient.invalidateQueries({
        queryKey: getLicenseQueryKey({
          path: { licenseSlug: variables.licenseSlug },
        }),
      });
    },
    onSettled: async () => {
      await invalidateLicenseLists(queryClient);
    },
  });
  const { isPending, mutate } = mutation;

  const run = useCallback(
    (target?: TransitionVariables) => {
      if (target) {
        mutate(target);
        return;
      }
      if (licenseSlug) {
        mutate({ licenseSlug, transition });
      }
    },
    [licenseSlug, mutate, transition],
  );

  return { isPending, run, transition };
}
