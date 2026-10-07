import type { InvoiceSummary } from '@/api-client';

/** The stored status of an invoice, as the API sends it. */
export type InvoiceStatus = InvoiceSummary['status'];
export type HoldReason = NonNullable<InvoiceSummary['holdReason']>;

type BadgeTone =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'success'
  | 'outline';

/**
 * Every status, in the order a filter lists them. NoOp invoices are never
 * PUSHED, PUSH_FAILED or PAYMENT_FAILED, and Stripe ones never MANUAL, but a
 * screen does not rely on it: it renders whatever status comes.
 */
export const INVOICE_STATUSES = [
  'DRAFT',
  'MANUAL',
  'PUSHED',
  'PAID',
  'PUSH_FAILED',
  'PAYMENT_FAILED',
  'UNCOLLECTIBLE',
  'VOID',
] as const satisfies readonly InvoiceStatus[];

// `MANUAL` is an implementation word: an invoice issued and waiting for the
// organization's own accounts receivable. It reads "Ready to bill", and is
// never shown as a failure.
const STATUS_LABEL_KEYS = {
  DRAFT: 'Features.Billing.InvoiceStatus.DRAFT',
  MANUAL: 'Features.Billing.InvoiceStatus.MANUAL',
  PUSHED: 'Features.Billing.InvoiceStatus.PUSHED',
  PAID: 'Features.Billing.InvoiceStatus.PAID',
  PUSH_FAILED: 'Features.Billing.InvoiceStatus.PUSH_FAILED',
  PAYMENT_FAILED: 'Features.Billing.InvoiceStatus.PAYMENT_FAILED',
  UNCOLLECTIBLE: 'Features.Billing.InvoiceStatus.UNCOLLECTIBLE',
  VOID: 'Features.Billing.InvoiceStatus.VOID',
} as const satisfies Record<InvoiceStatus, string>;

/** The words of a stored status, with none of what an invoice derives from its dates or its hold. */
export const getInvoiceStatusLabelKey = (status: InvoiceStatus) =>
  STATUS_LABEL_KEYS[status];

const STATUS_TONES = {
  DRAFT: 'outline',
  MANUAL: 'default',
  PUSHED: 'secondary',
  PAID: 'success',
  PUSH_FAILED: 'destructive',
  PAYMENT_FAILED: 'destructive',
  UNCOLLECTIBLE: 'outline',
  VOID: 'outline',
} as const satisfies Record<InvoiceStatus, BadgeTone>;

const HOLD_REASON_LABEL_KEYS = {
  LEDGER_SEQUENCE_GAP: 'Features.Billing.HoldReason.LEDGER_SEQUENCE_GAP',
  LEDGER_CHAIN_BREAK: 'Features.Billing.HoldReason.LEDGER_CHAIN_BREAK',
  LEDGER_COUNTER_MISMATCH:
    'Features.Billing.HoldReason.LEDGER_COUNTER_MISMATCH',
} as const satisfies Record<HoldReason, string>;

export const getHoldReasonLabelKey = (reason: HoldReason) =>
  HOLD_REASON_LABEL_KEYS[reason];

/**
 * Whether the console has words for the check that held a draft. One the API
 * adds is not known until it has a label here, and is shown as the API named it.
 */
export const isKnownHoldReason = (reason: string): reason is HoldReason =>
  Object.hasOwn(HOLD_REASON_LABEL_KEYS, reason);

/** The fields of an invoice that decide how its status reads. */
export type InvoiceStatusInput = Pick<
  InvoiceSummary,
  'collectionMethod' | 'dueAt' | 'holdReason' | 'status'
>;

// Unpaid and issued: the statuses a due date can pass on.
const OVERDUE_STATUSES: readonly InvoiceStatus[] = ['MANUAL', 'PUSHED'];

/**
 * Whether an invoice is past its due date and still unpaid. The API does not
 * say, so the console derives it, and only for SEND_INVOICE: what
 * CHARGE_AUTOMATICALLY allows after the due date is the provider's, and the
 * console does not know it.
 */
export function isInvoiceOverdue(
  invoice: InvoiceStatusInput,
  now: number = Date.now(),
): boolean {
  if (
    invoice.collectionMethod !== 'SEND_INVOICE' ||
    !OVERDUE_STATUSES.includes(invoice.status) ||
    !invoice.dueAt
  ) {
    return false;
  }
  const due = Date.parse(invoice.dueAt);

  return !Number.isNaN(due) && due < now;
}

export type InvoiceStatusPresentation = {
  /** `held` and `overdue` are derived, never stored statuses. */
  kind: 'status' | 'held' | 'overdue';
  labelKey: string;
  tone: BadgeTone;
  /** What a held invoice is held for, to show beside its label. */
  holdReasonKey?: string;
};

/**
 * How an invoice's status reads: a held DRAFT says so and why, an overdue one
 * says so, and any other shows its stored status.
 */
export function getInvoiceStatusPresentation(
  invoice: InvoiceStatusInput,
  now?: number,
): InvoiceStatusPresentation {
  if (invoice.holdReason) {
    return {
      holdReasonKey: HOLD_REASON_LABEL_KEYS[invoice.holdReason],
      kind: 'held',
      labelKey: 'Features.Billing.InvoiceStatus.held',
      tone: 'destructive',
    };
  }
  if (isInvoiceOverdue(invoice, now)) {
    return {
      kind: 'overdue',
      labelKey: 'Features.Billing.InvoiceStatus.overdue',
      tone: 'destructive',
    };
  }

  return {
    kind: 'status',
    labelKey: STATUS_LABEL_KEYS[invoice.status],
    tone: STATUS_TONES[invoice.status],
  };
}
