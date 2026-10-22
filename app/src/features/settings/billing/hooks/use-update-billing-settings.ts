import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { invalidateBillingSettingsQueries } from '@/domains/billing';
import { saveBillingSettingsOnFresh } from '../queries/billing-settings-save';

/**
 * Replaces the defaults of the organization. It is not optimistic: the form says
 * what the API answered, and a refusal must never show as a success. What is read
 * from the settings (the dialog that subscribes an instance reads the payment
 * terms) is refreshed. The update replaces the three defaults together, so the
 * settings are read again first and only what the form changed is put on top of
 * them: a default saved from another tab since the page loaded stays.
 */
export function useUpdateBillingSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveBillingSettingsOnFresh,
    onSuccess: async () => {
      await invalidateBillingSettingsQueries(queryClient);
      toast.success(t('Pages.Settings.Billing.Defaults.saved'));
    },
  });
}
