import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Invoice } from '@/api-client';
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

/** How long a refusal that offers to ask again stays: long enough to be read, and acted on. */
const REFUSAL_TOAST_MS = 15_000;

type InvoiceMutationsOptions = {
  /** Told of the invoice the API answered a request to push again with: the page starts watching it. */
  onPushRequested?: (invoice: Invoice) => void;
};

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
 * finalizes at once. The page then watches for the result (`usePushWatch`): it is told
 * of the answer through `onPushRequested`. Reading the invoice back from the provider
 * (`sync`) is immediate, and a payment made there shows as the invoice being paid.
 *
 * Neither has a dialog to show a refusal in, so it is a toast in the API's words. A
 * provider that cannot be reached changed nothing: the toast says so and offers to ask
 * again, and the invoice stays what it was.
 */
export function useInvoiceMutations(
  invoiceId: string,
  { onPushRequested }: InvoiceMutationsOptions = {},
) {
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
  const tellRefusal = (error: unknown, retry: () => void) => {
    refreshOnConflict(error);
    const problem = handleBillingProblem(error);
    const detail = problem.detail ?? t('Features.Billing.Problems.generic');

    if (problem.kind !== 'transient') {
      toast.error(detail);

      return;
    }
    toast.error(detail, {
      action: { label: t('Common.retry'), onClick: retry },
      description: t(
        problem.providerUnavailable
          ? 'Features.Billing.Problems.providerUnreachable'
          : 'Features.Billing.Problems.transient',
      ),
      duration: REFUSAL_TOAST_MS,
    });
  };
  const retryPush = useMutation({
    ...retryInvoicePushMutation(),
    onError: (error, variables) =>
      tellRefusal(error, () => retryPush.mutate(variables)),
    onSuccess: async (invoice) => {
      await refresh();
      toast.success(
        t(
          invoice.status === 'DRAFT' || invoice.status === 'PUSH_FAILED'
            ? 'Pages.Billing.Invoices.Toasts.pushRequested'
            : 'Pages.Billing.Invoices.Toasts.finalized',
        ),
      );
      onPushRequested?.(invoice);
    },
  });
  const sync = useMutation({
    ...syncInvoiceMutation(),
    onError: (error, variables) =>
      tellRefusal(error, () => sync.mutate(variables)),
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
