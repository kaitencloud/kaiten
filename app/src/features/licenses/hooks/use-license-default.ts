import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { License } from '@/api-client';
import { updateLicenseMutation } from '@/api-client/@tanstack/react-query.gen';
import { getApiErrorMessage } from '@/lib/errors';
import { invalidateLicenseDetails, invalidateLicenseLists } from '../queries';

type DefaultLicense = Pick<
  License,
  'description' | 'name' | 'slug' | 'type' | 'versionName'
>;

// Makes a version its family's default, or stops it being one. Both are an
// update restating the version as it is, with isDefault flipped; the server
// takes the flag from the previous default itself, so every version's page is
// refreshed, not only this one's.
export function useLicenseDefault(license: DefaultLicense) {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  const mutation = useMutation({
    ...updateLicenseMutation(),
    onSuccess: (_data, variables) => {
      toast.success(
        t(
          variables.body.isDefault
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
        body: {
          description: license.description,
          isDefault,
          name: license.name,
          type: license.type,
          versionName: license.versionName,
        },
        path: { licenseSlug: license.slug },
      });
    },
    [license, mutate],
  );

  const setDefault = useCallback(() => write(true), [write]);
  const unsetDefault = useCallback(() => write(false), [write]);

  return { isPending, setDefault, unsetDefault };
}
