import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  createLicensePriceMutation,
  deprecateLicensePriceMutation,
  updateLicensePriceMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { invalidateLicensePriceQueries } from '@/domains/billing';

/**
 * What a person does to the prices of a version: add one, edit one of a draft,
 * deprecate one. A billing write is never optimistic: the screen shows a price
 * once the API has accepted it, and a refusal is read from the failure by the
 * caller, which shows it where the person is looking (the form, the dialog).
 * Each success refreshes the prices of the version and the version itself.
 */
export function useLicensePriceMutations(licenseSlug: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = () => invalidateLicensePriceQueries(queryClient, licenseSlug);

  const create = useMutation({
    ...createLicensePriceMutation(),
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Licenses.Prices.Toasts.created'));
    },
  });
  const update = useMutation({
    ...updateLicensePriceMutation(),
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Licenses.Prices.Toasts.updated'));
    },
  });
  const deprecate = useMutation({
    ...deprecateLicensePriceMutation(),
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Licenses.Prices.Toasts.deprecated'));
    },
  });

  return { create, deprecate, update };
}
