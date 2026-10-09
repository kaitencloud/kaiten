import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { syncBillingProviderMutation } from '@/api-client/@tanstack/react-query.gen';
import { invalidateProviderSyncQueries } from '@/domains/billing';
import { summarizeSyncReport } from '../utils/sync-report';

/**
 * Runs a pass of the payment providers now, instead of waiting for the periodic
 * one: what was paid, voided or finalized there is mirrored in Kaiten. The API
 * answers with what each provider did, which is said in a toast, and the invoices,
 * the subscriptions and the health that count them are read again. It is not
 * optimistic: a refusal (nothing is connected, the provider cannot be reached)
 * stays with the caller, which shows it where the person asked.
 */
export function useSyncBilling() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    ...syncBillingProviderMutation(),
    onSuccess: async (report) => {
      await invalidateProviderSyncQueries(queryClient);
      const summary = summarizeSyncReport(report);

      if (summary.kind === 'done') {
        toast.success(
          summary.applied === 0
            ? t('Pages.Settings.Billing.Health.Sync.nothingNew')
            : t('Pages.Settings.Billing.Health.Sync.done', {
                count: summary.applied,
              }),
        );
      } else if (summary.kind === 'partial') {
        toast.warning(t('Pages.Settings.Billing.Health.Sync.partial'), {
          description: summary.error,
        });
      } else {
        toast.error(t('Pages.Settings.Billing.Health.Sync.failed'), {
          description: summary.error,
        });
      }
    },
  });
}
