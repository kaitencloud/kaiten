import { useState } from 'react';
import type { Invoice } from '@/api-client';
import {
  getInvoiceActions,
  getRetentionStart,
  type InvoiceAction,
  useBillingCapabilities,
  useInvoiceActionAccess,
} from '@/domains/billing';
import { InvoiceActionButtons } from './invoice-action-buttons';
import { MarkPaidDialog } from './mark-paid-dialog';
import { RecomposeDialog } from './recompose-dialog';
import { ReleaseHoldDialog } from './release-hold-dialog';
import { VoidDialog } from './void-dialog';
import { VoidThenRecomposeDialog } from './void-then-recompose-dialog';
import { WriteOffDialog } from './write-off-dialog';

type InvoiceActionsProps = {
  invoice: Invoice;
};

type OpenDialog = InvoiceAction | 'voidThenRecompose' | null;

/**
 * What a session may do to the invoice it is looking at: the actions its status
 * offers (`getInvoiceActions`), each shown only to a session whose scopes cover
 * it, and each behind the dialog that asks what it needs. Nothing here is
 * optimistic: the invoice changes on the page once the API has answered.
 *
 * The page does not know whether the instance of the invoice still exists, and the
 * API refuses to recompose for one that was deleted: once it has said so, the
 * recompose is shown disabled with the reason, for as long as the page is open.
 *
 * The dialog that is open stays open when the invoice stops offering its action:
 * a 409 says someone else got there first (the invoice was paid, voided), the page
 * reads the invoice again and it no longer offers anything, and the refusal the
 * person came to read is still in the dialog they asked from.
 */
export function InvoiceActions({ invoice }: InvoiceActionsProps) {
  const { capabilities } = useBillingCapabilities();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  // The instance the API said was deleted: by its slug, so that another invoice
  // of the same page is not taken for one whose instance is gone.
  const [deletedInstance, setDeletedInstance] = useState<string | null>(null);
  const canPerform = useInvoiceActionAccess();

  const states = getInvoiceActions(invoice, {
    instanceDeleted: deletedInstance === invoice.instanceSlug,
    retentionStart: getRetentionStart(
      capabilities?.usageHistoryRetentionMonths,
    ),
  }).filter(({ action }) => canPerform[action]);

  const close = () => setDialog(null);

  return (
    <>
      {states.length > 0 ? (
        <InvoiceActionButtons onRun={setDialog} states={states} />
      ) : null}
      {dialog === 'releaseHold' ? (
        <ReleaseHoldDialog invoice={invoice} onClose={close} />
      ) : null}
      {dialog === 'markPaid' ? (
        <MarkPaidDialog invoice={invoice} onClose={close} />
      ) : null}
      {dialog === 'writeOff' ? (
        <WriteOffDialog invoice={invoice} onClose={close} />
      ) : null}
      {dialog === 'void' ? (
        <VoidDialog invoice={invoice} onClose={close} />
      ) : null}
      {dialog === 'recompose' ? (
        <RecomposeDialog
          invoice={invoice}
          onClose={close}
          onInstanceDeleted={() => setDeletedInstance(invoice.instanceSlug)}
          onNeedsVoid={() => setDialog('voidThenRecompose')}
        />
      ) : null}
      {dialog === 'voidThenRecompose' ? (
        <VoidThenRecomposeDialog invoice={invoice} onClose={close} />
      ) : null}
    </>
  );
}
