import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { License } from '@/api-client';
import { getApiErrorMessage } from '@/lib/errors';
import {
  invalidateLicenseDetails,
  invalidateLicenseLists,
  saveLicenseOnFresh,
} from '../queries';
import { licenseToUpdateBody } from '../schemas';

type DefaultLicense = Parameters<typeof licenseToUpdateBody>[0] &
  Pick<License, 'slug'>;

// Makes a version its family's default, or stops it being one. Both are an
// update restating the version, with isDefault flipped and nothing else: the
// version is read again first, so that what changed on it since the page loaded
// (its terms, its name) is not taken back, and neither is a default that moved
// meanwhile. The server takes the flag from the previous default itself, so
// every version's page is refreshed, not only this one's.
export function useLicenseDefault(license: DefaultLicense) {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  const mutation = useMutation({
    mutationFn: saveLicenseOnFresh,
    onSuccess: (_data, variables) => {
      toast.success(
        t(
          variables.edited.isDefault
            ? 'Pages.Licenses.DefaultActions.setSuccess'
            : 'Pages.Licenses.DefaultActions.unsetSuccess',
        ),
      );
    },
    // The API says why it refused -- the version is not published, or another
    // one took the default meanwhile -- and that is what the vendor needs.
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t));
    },
    onSettled: async () => {
      await Promise.all([
        invalidateLicenseLists(queryClient),
        invalidateLicenseDetails(queryClient),
      ]);
    },
  });
  const { isPending, mutate } = mutation;

  const write = useCallback(
    (isDefault: boolean) => {
      if (!license.slug) {
        return;
      }
      mutate({
        edited: { ...licenseToUpdateBody(license), isDefault },
        licenseSlug: license.slug,
        opened: licenseToUpdateBody(license),
      });
    },
    [license, mutate],
  );

  const setDefault = useCallback(() => write(true), [write]);
  const unsetDefault = useCallback(() => write(false), [write]);

  return { isPending, setDefault, unsetDefault };
}
