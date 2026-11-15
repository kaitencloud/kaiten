import { useAiAccess, isAiEntitlement } from '@/domains/ai-credits';
import { entitlementsQueryOptions, addonGrantsQueryOptions } from '../queries';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  assignAddonEntitlementMutation,
  unassignAddonEntitlementMutation,
} from '@/api-client/@tanstack/react-query.gen';
import {
  type SaveAddonGrantVariables,
  invalidateAddonGrantQueries,
  saveAddonGrantOnFresh,
} from '../queries';

/**
 * What a person does to the grants of a version: give it one, replace one (the grant
 * is read again first and only what the form changed is put on top of it), take one
 * away. A billing write is never optimistic: the screen shows a grant once the API
 * has accepted it, and a refusal is read from the failure by the caller, which shows
 * it where the person is looking (the dialog, the confirmation). Each success
 * refreshes the grants of the version.
 */
export function useAddonGrantMutations(addonSlug: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const access = useAiAccess();
  const assignment = assignAddonEntitlementMutation();
  const removal = unassignAddonEntitlementMutation();
  function checkTarget(slug: string) {
    const type =
      queryClient
        .getQueryData(addonGrantsQueryOptions(addonSlug).queryKey)
        ?.find((grant) => grant.entitlementSlug === slug)?.entitlementType ??
      queryClient
        .getQueryData(entitlementsQueryOptions.queryKey)
        ?.items.find((item) => item.slug === slug)?.type;
    if (!access.available && isAiEntitlement(type))
      throw new Error('AIUsage.Disabled');
  }
  const refresh = () => invalidateAddonGrantQueries(queryClient, addonSlug);

  const assign = useMutation({
    ...assignment,
    mutationFn: (variables, context) => {
      checkTarget(variables.body.entitlementSlug);
      return assignment.mutationFn!(variables, context);
    },
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Addons.Grants.Toasts.assigned'));
    },
  });
  const update = useMutation({
    mutationFn: (variables: SaveAddonGrantVariables) => {
      checkTarget(variables.entitlementSlug);
      return saveAddonGrantOnFresh(variables, access.available);
    },
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Addons.Grants.Toasts.updated'));
    },
  });
  const unassign = useMutation({
    ...removal,
    mutationFn: (variables, context) => {
      checkTarget(variables.path.entitlementSlug);
      return removal.mutationFn!(variables, context);
    },
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Addons.Grants.Toasts.unassigned'));
    },
  });

  return { assign, unassign, update };
}
