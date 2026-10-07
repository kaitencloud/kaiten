import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ackHandoffMutation } from '@/api-client/@tanstack/react-query.gen';
import {
  handleBillingProblem,
  invalidateInvoiceQueries,
} from '@/domains/billing';

/**
 * Acknowledges an invoice of the handoff queue by hand: the accounting system
 * booked it, under the number given, and no consumer claimed it. It is the
 * exception: the queue is read by a job or the CLI, which acknowledge with the
 * lease of their claim. Never optimistic: the queue shows the invoice as
 * acknowledged once the API has said so, and a refusal is read from the failure by
 * the caller, which shows it in the dialog. A 409 says the invoice is not what the
 * queue showed (another consumer booked it under another number): the queue is read
 * again.
 */
export function useAcknowledgeHandoff() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    ...ackHandoffMutation(),
    onError: async (error) => {
      if (handleBillingProblem(error).status === 409) {
        await invalidateInvoiceQueries(queryClient);
      }
    },
    onSuccess: async (invoice) => {
      await invalidateInvoiceQueries(queryClient, invoice.id);
      toast.success(t('Pages.Billing.Handoff.Toasts.acknowledged'));
    },
  });
}
