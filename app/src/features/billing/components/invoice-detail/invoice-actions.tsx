import { useState } from 'react';
import type { Invoice } from '@/api-client';
import {
  getInvoiceActions,
  getRetentionStart,
  type InvoiceAction,
  useBillingCapabilities,
  useInvoiceActionAccess,
} from '@/domains/billing';
import { type PushPhase, useInvoiceMutations } from '../../hooks';
import { InvoiceActionButtons } from './invoice-action-buttons';
import { MarkPaidDialog } from './mark-paid-dialog';
import { RecomposeDialog } from './recompose-dialog';
import { ReleaseHoldDialog } from './release-hold-dialog';
import { VoidDialog } from './void-dialog';
import { VoidThenRecomposeDialog } from './void-then-recompose-dialog';
import { WriteOffDialog } from './write-off-dialog';

type InvoiceActionsProps = {
  invoice: Invoice;
  /** Starts watching the push the person just asked for; a page that does not watch passes none. */
  onPushRequested?: (invoice: Invoice) => void;
  /** Where the push the person asked for stands: pushing again waits for the one that runs. */
  pushPhase?: PushPhase;
};

/** The actions that ask for something first: the ones that run at once have no dialog. */
type DialogAction = Exclude<InvoiceAction, 'retryPush' | 'sync'>;

type OpenDialog = DialogAction | 'voidThenRecompose' | null;

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
 *
 * Pushing an invoice again and reading it back from its provider ask for nothing: they
 * run at once, and their button waits while they do. A push only queues the invoice, so
 * the page watches for its result, and the button waits for that as well.
 */
export function InvoiceActions({
  invoice,
  onPushRequested,
  pushPhase = 'idle',
}: InvoiceActionsProps) {
  const { capabilities } = useBillingCapabilities();
  const { retryPush, sync } = useInvoiceMutations(invoice.id, {
    onPushRequested,
  });
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
  const pending: InvoiceAction[] = [
    ...(retryPush.isPending || pushPhase === 'waiting'
      ? (['retryPush'] as const)
      : []),
    ...(sync.isPending ? (['sync'] as const) : []),
  ];

  function run(action: InvoiceAction) {
    const path = { invoiceId: invoice.id };

    if (action === 'retryPush') {
      retryPush.mutate({ path });
    } else if (action === 'sync') {
      sync.mutate({ path });
    } else {
      setDialog(action);
    }
  }

  return (
    <>
      {states.length > 0 ? (
        <InvoiceActionButtons onRun={run} pending={pending} states={states} />
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
