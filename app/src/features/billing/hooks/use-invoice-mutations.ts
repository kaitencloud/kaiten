import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  markInvoicePaidMutation,
  recomposeInvoiceMutation,
  releaseInvoiceHoldMutation,
  retryInvoicePushMutation,
  syncInvoiceMutation,
  voidInvoiceMutation,
  writeOffInvoiceMutation,
} from '@/api-client/@tanstack/react-query.gen';
import {
  handleBillingProblem,
  invalidateInvoiceQueries,
} from '@/domains/billing';

/**
 * What a person does to one invoice: accept a held one as composed, rebuild it,
 * record that it was paid, write it off, void it, and for an invoice a payment
 * provider collects, push it again and read it back from the provider. A billing
 * write is never
 * optimistic: the page shows the invoice as the API answered once it has, and a
 * refusal is read from the failure by the caller, which shows it where the person
 * is looking (the dialog). Each success refreshes the invoice, the list and the
 * handoff queue, which an action changes, and says what happened.
 *
 * A 409 says the invoice is no longer what the page showed (someone else paid it,
 * voided it, or a boundary closed on it): the page reads it again, so that what it
 * offers next is what is possible now, while the dialog shows the refusal.
 *
 * A recompose of a VOID invoice gives a replacement, which is another invoice: the
 * person lands on it, since the page they were on is the one that was replaced.
 *
 * Pushing again does not push: the API puts the invoice back in the queue (202) and
 * answers with it, unless the provider holds it as a draft for a person, which it
 * finalizes at once. The page then watches for the result (`usePushWatch`). Reading
 * the invoice back from the provider (`sync`) is immediate, and a payment made there
 * shows as the invoice being paid.
 */
export function useInvoiceMutations(invoiceId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const refresh = () => invalidateInvoiceQueries(queryClient, invoiceId);
  const refreshOnConflict = (error: unknown) => {
    if (handleBillingProblem(error).status === 409) {
      void refresh();
    }
  };

  const releaseHold = useMutation({
    ...releaseInvoiceHoldMutation(),
    onError: refreshOnConflict,
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Billing.Invoices.Toasts.released'));
    },
  });
  const markPaid = useMutation({
    ...markInvoicePaidMutation(),
    onError: refreshOnConflict,
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Billing.Invoices.Toasts.paid'));
    },
  });
  const writeOff = useMutation({
    ...writeOffInvoiceMutation(),
    onError: refreshOnConflict,
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Billing.Invoices.Toasts.writtenOff'));
    },
  });
  const voidInvoice = useMutation({
    ...voidInvoiceMutation(),
    onError: refreshOnConflict,
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Billing.Invoices.Toasts.voided'));
    },
  });
  const recompose = useMutation({
    ...recomposeInvoiceMutation(),
    onError: refreshOnConflict,
    onSuccess: async (invoice) => {
      // The replacement is a new invoice: the list and the queue gain it.
      await Promise.all([
        refresh(),
        invalidateInvoiceQueries(queryClient, invoice.id),
      ]);
      if (invoice.id !== invoiceId) {
        toast.success(t('Pages.Billing.Invoices.Toasts.replaced'));
        await navigate({
          params: { invoiceId: invoice.id },
          to: '/billing/invoices/$invoiceId',
        });

        return;
      }
      toast.success(t('Pages.Billing.Invoices.Toasts.recomposed'));
    },
  });

  // A push or a read that is refused has no dialog to show it in: it is said as a toast.
  const tellRefusal = (error: unknown) => {
    refreshOnConflict(error);
    toast.error(
      handleBillingProblem(error).detail ??
        t('Features.Billing.Problems.generic'),
    );
  };
  const retryPush = useMutation({
    ...retryInvoicePushMutation(),
    onError: tellRefusal,
    onSuccess: async (invoice) => {
      await refresh();
      toast.success(
        t(
          invoice.status === 'DRAFT' || invoice.status === 'PUSH_FAILED'
            ? 'Pages.Billing.Invoices.Toasts.pushRequested'
            : 'Pages.Billing.Invoices.Toasts.finalized',
        ),
      );
    },
  });
  const sync = useMutation({
    ...syncInvoiceMutation(),
    onError: tellRefusal,
    onSuccess: async (invoice) => {
      await refresh();
      toast.success(
        t(
          invoice.status === 'PAID'
            ? 'Pages.Billing.Invoices.Toasts.syncedPaid'
            : 'Pages.Billing.Invoices.Toasts.synced',
        ),
      );
    },
  });

  return {
    markPaid,
    recompose,
    releaseHold,
    retryPush,
    sync,
    voidInvoice,
    writeOff,
  };
}
