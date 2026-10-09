import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  createAddonPriceMutation,
  deprecateAddonPriceMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { invalidateAddonPriceQueries } from '../queries';

/**
 * What a person does to the prices of a version: add one, deprecate one. A price is
 * never edited -- the API has no update, a change is a new price and the deprecation
 * of the old one. A billing write is never optimistic: the screen shows a price once
 * the API has accepted it, and a refusal is read from the failure by the caller,
 * which shows it where the person is looking (the drawer, the confirmation). Each
 * success refreshes the prices of the version.
 */
export function useAddonPriceMutations(addonSlug: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = () => invalidateAddonPriceQueries(queryClient, addonSlug);

  const create = useMutation({
    ...createAddonPriceMutation(),
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Addons.Prices.Toasts.created'));
    },
  });
  const deprecate = useMutation({
    ...deprecateAddonPriceMutation(),
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Addons.Prices.Toasts.deprecated'));
    },
  });

  return { create, deprecate };
}
