import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  getAddonFamilyQueryKey,
  updateAddonFamilyMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { getApiErrorMessage } from '@/lib/errors';
import { invalidateAddonQueries } from '../queries';

/**
 * Lists a family of add-ons in the public catalogue, or takes it out. The listing is
 * a billing write: it is not optimistic, and the switch shows what the API answered,
 * so a refusal never reads as a change. The families are read again when it is
 * accepted, the one list that carries the flag; a refusal is said in the API's own
 * words in a toast, since a switch has no form to show it in.
 */
export function useAddonFamilyVisibility() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    ...updateAddonFamilyMutation(),
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t));
    },
    onSuccess: async (family, { path }) => {
      await Promise.all([
        invalidateAddonQueries(queryClient),
        queryClient.invalidateQueries({
          queryKey: getAddonFamilyQueryKey({
            path: { familySlug: path.familySlug },
          }),
        }),
      ]);
      toast.success(
        t(
          family.isPublic
            ? 'Pages.Addons.Public.listed'
            : 'Pages.Addons.Public.unlisted',
        ),
      );
    },
  });
}
