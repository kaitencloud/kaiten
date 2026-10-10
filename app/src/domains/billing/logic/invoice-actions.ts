import type { InvoiceSummary, ProviderRecord } from '@/api-client';
import type { BillingAction } from './billing-actions';
import { getPushVariant, type PushVariant } from './invoice-provider';

/** What a person does to one invoice. */
export type InvoiceAction =
  | 'releaseHold'
  | 'recompose'
  | 'markPaid'
  | 'writeOff'
  | 'void'
  | 'retryPush'
  | 'sync';

/**
 * The billing action each invoice action is, which is where its scope comes
 * from: the scope the contract gives the operation the action calls.
 */
export const INVOICE_ACTION_SCOPES = {
  markPaid: 'invoice.markPaid',
  recompose: 'invoice.recompose',
  releaseHold: 'invoice.releaseHold',
  retryPush: 'invoice.retryPush',
  sync: 'invoice.sync',
  void: 'invoice.void',
  writeOff: 'invoice.writeOff',
} as const satisfies Record<InvoiceAction, BillingAction>;

/** Why an action that the status allows cannot be run now. */
export type InvoiceActionUnavailable =
  /**
   * The usage the invoice was measured from is no longer kept, and a recompose
   * would give a replacement with no usage line, without an error.
   */
  | { reason: 'purged-usage'; retentionStart: Date }
  /** The instance the invoice was composed for was deleted: its usage cannot be measured again. */
  | { reason: 'instance-deleted' };

export type InvoiceActionState = {
  action: InvoiceAction;
  /** Set when the action is offered but cannot be run: shown on the disabled button. */
  unavailable?: InvoiceActionUnavailable;
  /** For `retryPush`: what pushing the invoice again means, which is how the button reads. */
  variant?: PushVariant;
};

/** The fields of an invoice that decide what can be done to it. */
export type InvoiceActionsInput = Pick<
  InvoiceSummary,
  'holdReason' | 'serviceFrom' | 'status'
> & {
  /**
   * Where the invoice stands in its payment provider, once it is there: its id
   * there is what lets it be read back. Absent for an invoice nobody pushed.
   */
  provider?: Pick<ProviderRecord, 'externalInvoiceId' | 'nextPushAt'> | null;
  /** Who collects the invoice; none reads as the organization itself. */
  providerKind?: InvoiceSummary['providerKind'];
  /** The invoice recomposed from this VOID one, once there is one; null while there is none. */
  replacedByInvoiceId?: string | null;
};

export type InvoiceActionsContext = {
  /** The instance of the invoice was deleted: a recompose answers 409 for it. */
  instanceDeleted?: boolean;
  /** Where the usage the organization keeps begins, when it is known. */
  retentionStart?: Date | null;
};

/**
 * The actions an invoice offers, in the order they are shown, from its status:
 *
 * - a held DRAFT is accepted as composed (release), rebuilt from the journal as
 *   it is now (recompose) or voided;
 * - a MANUAL invoice, issued and waiting for the organization's own accounts
 *   receivable, is marked paid, written off or voided;
 * - a draft a payment provider has not taken, and a push that failed, can only be
 *   voided; one that Stripe collects is pushed again first (`retryPush`), which also
 *   finalizes a draft waiting for it in Stripe, and read back once it is there (`sync`);
 * - an invoice Stripe has accepted (PUSHED, PAYMENT_FAILED) is read back (`sync`) or
 *   voided, in Stripe first;
 * - a VOID invoice is recomposed into its replacement, once;
 * - a PAID, written-off or replaced invoice is final.
 *
 * An invoice a payment provider has accepted offers neither mark paid nor write
 * off: the payment is recorded there, and `sync` mirrors it.
 *
 * Only what the API would accept is offered. What it would refuse for a reason the
 * screen can tell (usage that is gone, an instance that was deleted) is offered
 * disabled, with the reason.
 */
export function getInvoiceActions(
  invoice: InvoiceActionsInput,
  context: InvoiceActionsContext = {},
): InvoiceActionState[] {
  switch (invoice.status) {
    case 'DRAFT':
      return invoice.holdReason
        ? [
            { action: 'releaseHold' },
            recompose(invoice, context, false),
            { action: 'void' },
          ]
        : [...pushActions(invoice), { action: 'void' }];
    case 'MANUAL':
      return [
        { action: 'markPaid' },
        { action: 'writeOff' },
        { action: 'void' },
      ];
    case 'PUSH_FAILED':
      return [...pushActions(invoice), { action: 'void' }];
    case 'PUSHED':
    case 'PAYMENT_FAILED':
      return invoice.providerKind === 'STRIPE'
        ? [{ action: 'sync' }, { action: 'void' }]
        : [];
    case 'VOID':
      return invoice.replacedByInvoiceId
        ? []
        : [recompose(invoice, context, true)];
    default:
      return [];
  }
}

/**
 * What an invoice Stripe is to collect offers while it has not been taken, or
 * after a push failed: push it again, which finalizes a draft waiting in Stripe,
 * and read it back once Stripe holds it. A push that never created the Stripe
 * invoice has nothing to read.
 */
function pushActions(invoice: InvoiceActionsInput): InvoiceActionState[] {
  if (invoice.providerKind !== 'STRIPE') {
    return [];
  }

  const retryPush: InvoiceActionState = {
    action: 'retryPush',
    variant: getPushVariant(invoice),
  };

  return invoice.provider?.externalInvoiceId
    ? [retryPush, { action: 'sync' }]
    : [retryPush];
}

function recompose(
  invoice: InvoiceActionsInput,
  { instanceDeleted, retentionStart }: InvoiceActionsContext,
  checksRetention: boolean,
): InvoiceActionState {
  if (instanceDeleted) {
    return { action: 'recompose', unavailable: { reason: 'instance-deleted' } };
  }
  // A held DRAFT keeps its usage whatever its age; a VOID invoice does not, and the
  // API does not refuse its recompose: it would give a replacement with no usage.
  if (
    checksRetention &&
    retentionStart &&
    Date.parse(invoice.serviceFrom) < retentionStart.getTime()
  ) {
    return {
      action: 'recompose',
      unavailable: { reason: 'purged-usage', retentionStart },
    };
  }

  return { action: 'recompose' };
}
