import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { updateBillingSettingsMutation } from '@/api-client/@tanstack/react-query.gen';
import { invalidateBillingSettingsQueries } from '@/domains/billing';

/**
 * Replaces the defaults of the organization. It is not optimistic: the form says
 * what the API answered, and a refusal must never show as a success. What is read
 * from the settings (the dialog that subscribes an instance reads the payment
 * terms) is refreshed.
 */
export function useUpdateBillingSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    ...updateBillingSettingsMutation(),
    onSuccess: async () => {
      await invalidateBillingSettingsQueries(queryClient);
      toast.success(t('Pages.Settings.Billing.Defaults.saved'));
    },
  });
}
