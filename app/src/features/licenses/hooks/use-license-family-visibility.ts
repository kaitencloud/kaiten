import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  getLicenseFamilyQueryKey,
  listLicenseFamiliesQueryKey,
  updateLicenseFamilyMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { getApiErrorMessage } from '@/lib/errors';

/**
 * Lists a family of licenses in the public catalogue, or takes it out. The listing
 * is a billing write: it is not optimistic, and the switch shows what the API
 * answered, so a refusal never reads as a change. The families are read again when
 * it is accepted, the one list that carries the flag; a refusal is said in the API's
 * own words in a toast, since a switch has no form to show it in.
 */
export function useLicenseFamilyVisibility() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    ...updateLicenseFamilyMutation(),
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
    onSuccess: async (family, { path }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: listLicenseFamiliesQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: getLicenseFamilyQueryKey({
            path: { familySlug: path.familySlug },
          }),
        }),
      ]);
      toast.success(
        t(
          family.isPublic
            ? 'Pages.Licenses.Public.listed'
            : 'Pages.Licenses.Public.unlisted',
        ),
      );
    },
  });
}
