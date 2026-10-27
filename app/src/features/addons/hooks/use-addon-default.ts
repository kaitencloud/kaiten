import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Addon } from '@/api-client';
import { getApiErrorMessage } from '@/lib/errors';
import {
  invalidateAddonDetails,
  invalidateAddonQueries,
  saveAddonOnFresh,
} from '../queries';
import { addonToChangesBody } from '../schemas';

/**
 * Moves the default of a family onto a version, or off it. The API replaces a
 * version as a whole, so the version is read again and restated as it stands with
 * only the flag changed: what was edited on it from another tab since the page
 * loaded stays. Moving a family's default changes two versions, and only the server
 * knows which one lost the flag, so every detail is read again with the lists.
 */
export function useAddonDefault(addon: Addon) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: saveAddonOnFresh,
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t));
    },
    onSettled: async () => {
      await Promise.all([
        invalidateAddonQueries(queryClient),
        invalidateAddonDetails(queryClient),
      ]);
    },
    onSuccess: (_updated, { edited }) => {
      toast.success(
        t(
          edited.isDefault
            ? 'Pages.Addons.DefaultActions.setSuccess'
            : 'Pages.Addons.DefaultActions.unsetSuccess',
        ),
      );
    },
  });

  const change = (isDefault: boolean) =>
    mutation.mutate({
      addonSlug: addon.slug,
      edited: addonToChangesBody(addon, isDefault),
      opened: addonToChangesBody(addon, addon.isDefault),
    });

  return {
    isPending: mutation.isPending,
    setDefault: () => change(true),
    unsetDefault: () => change(false),
  };
}
