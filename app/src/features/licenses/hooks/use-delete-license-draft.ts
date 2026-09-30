import { type QueryClient, useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { deleteLicense, deleteLicenseEntitlement } from '@/api-client';
import { getApiErrorMessage } from '@/lib/errors';
import {
  invalidateLicenseLists,
  licenseEntitlementsQueryOptions,
} from '../queries';

// A draft was never on sale, so its grants are only its own configuration --
// the new-version form copies them from the base -- and they go first: the
// API refuses to delete a version that still grants anything. An instance
// still on the draft is the one refusal left, and the API says so.
async function deleteDraft(queryClient: QueryClient, licenseSlug: string) {
  const grants = await queryClient.fetchQuery({
    ...licenseEntitlementsQueryOptions(licenseSlug),
    staleTime: 0,
  });
  for (const grant of grants.items ?? []) {
    if (!grant.entitlementSlug) {
      continue;
    }
    await deleteLicenseEntitlement({
      path: { entitlementSlug: grant.entitlementSlug, licenseSlug },
      throwOnError: true,
    });
  }
  await deleteLicense({ path: { licenseSlug }, throwOnError: true });
}

// Deletes a draft version, the way out the API gives for one: archiving is
// for versions that have been on sale.
export function useDeleteLicenseDraft(onDeleted?: () => void) {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  const mutation = useMutation({
    mutationFn: ({ licenseSlug }: { licenseSlug: string }) =>
      deleteDraft(queryClient, licenseSlug),
    onSuccess: () => {
      toast.success(t('Pages.Licenses.DeleteDraft.success'));
      onDeleted?.();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t));
    },
    onSettled: async () => {
      await invalidateLicenseLists(queryClient);
    },
  });

  return { deleteDraft: mutation.mutate, isPending: mutation.isPending };
}
