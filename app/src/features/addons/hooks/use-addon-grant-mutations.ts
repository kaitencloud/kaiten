import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  assignAddonEntitlementMutation,
  unassignAddonEntitlementMutation,
  updateAddonEntitlementMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { invalidateAddonGrantQueries } from '../queries';

/**
 * What a person does to the grants of a version: give it one, replace one, take one
 * away. A billing write is never optimistic: the screen shows a grant once the API
 * has accepted it, and a refusal is read from the failure by the caller, which shows
 * it where the person is looking (the dialog, the confirmation). Each success
 * refreshes the grants of the version.
 */
export function useAddonGrantMutations(addonSlug: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = () => invalidateAddonGrantQueries(queryClient, addonSlug);

  const assign = useMutation({
    ...assignAddonEntitlementMutation(),
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Addons.Grants.Toasts.assigned'));
    },
  });
  const update = useMutation({
    ...updateAddonEntitlementMutation(),
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Addons.Grants.Toasts.updated'));
    },
  });
  const unassign = useMutation({
    ...unassignAddonEntitlementMutation(),
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Addons.Grants.Toasts.unassigned'));
    },
  });

  return { assign, unassign, update };
}
