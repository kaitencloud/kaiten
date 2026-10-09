import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Addon } from '@/api-client';
import { updateAddonMutation } from '@/api-client/@tanstack/react-query.gen';
import { getApiErrorMessage } from '@/lib/errors';
import { invalidateAddonDetails, invalidateAddonQueries } from '../queries';
import { addonToChangesBody } from '../schemas';

/**
 * Moves the default of a family onto a version, or off it. The API replaces a
 * version as a whole, so the version is restated as it stands with only the flag
 * changed. Moving a family's default changes two versions, and only the server knows
 * which one lost the flag, so every detail is read again with the lists.
 */
export function useAddonDefault(addon: Addon) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...updateAddonMutation(),
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t));
    },
    onSettled: async () => {
      await Promise.all([
        invalidateAddonQueries(queryClient),
        invalidateAddonDetails(queryClient),
      ]);
    },
    onSuccess: (_updated, { body }) => {
      toast.success(
        t(
          body.isDefault
            ? 'Pages.Addons.DefaultActions.setSuccess'
            : 'Pages.Addons.DefaultActions.unsetSuccess',
        ),
      );
    },
  });

  const change = (isDefault: boolean) =>
    mutation.mutate({
      body: addonToChangesBody(addon, isDefault),
      path: { addonSlug: addon.slug },
    });

  return {
    isPending: mutation.isPending,
    setDefault: () => change(true),
    unsetDefault: () => change(false),
  };
}
