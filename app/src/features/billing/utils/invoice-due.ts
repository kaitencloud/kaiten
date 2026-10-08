import type { Invoice } from '@/api-client';
import { isInvoiceOverdue } from '@/domains/billing';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The fields of an invoice that say where it stands in being paid. */
export type InvoiceDueInput = Pick<
  Invoice,
  | 'collectionMethod'
  | 'dueAt'
  | 'holdReason'
  | 'issuedAt'
  | 'paidAt'
  | 'status'
  | 'uncollectibleAt'
  | 'voidedAt'
>;

/** How an invoice that is no longer to be paid ended. */
export type InvoiceEnding = 'paid' | 'written-off' | 'voided';

/**
 * What the due figure of an invoice stands for, so that a screen words it without
 * working it out: an invoice that was not issued has no due date, one that ended
 * is no longer due and says how and when, and one still to be paid is due on a day.
 */
export type InvoiceDue =
  /** A draft, held or not: nothing was issued, so nothing is due. */
  | { kind: 'not-issued' }
  /** Issued and still to be settled, with no due date to read. */
  | { kind: 'no-due-date' }
  /** Issued and still to be settled. */
  | {
      /** Whole UTC days from today to the due day, negative once it has passed. */
      days: number;
      dueAt: string;
      /** Past its due date and unpaid, as the status badge derives it. */
      overdue: boolean;
      kind: 'due';
    }
  /**
   * Paid, written off or voided: when, which is not always known, and the day it
   * fell due, which the figure no longer states and the summary keeps.
   */
  | {
      at: string | undefined;
      dueAt: string | undefined;
      ending: InvoiceEnding;
      kind: 'ended';
    };

const utcDay = (instant: number) => Math.floor(instant / DAY_MS);

/** The due date as the API wrote it, or nothing when it has none or it is no date. */
const dueDateOf = ({ dueAt }: Pick<InvoiceDueInput, 'dueAt'>) =>
  dueAt && !Number.isNaN(Date.parse(dueAt)) ? dueAt : undefined;

/**
 * Where an invoice stands in being paid. The days are counted between UTC days,
 * like every date of billing: an invoice due at any hour of today is no days away.
 * "Overdue" is the badge's own rule (`isInvoiceOverdue`), so that the figure never
 * says an invoice is overdue that its status does not.
 */
export function getInvoiceDue(
  invoice: InvoiceDueInput,
  now: number = Date.now(),
): InvoiceDue {
  const dueAt = dueDateOf(invoice);

  if (invoice.status === 'PAID') {
    return { at: invoice.paidAt, dueAt, ending: 'paid', kind: 'ended' };
  }
  if (invoice.status === 'UNCOLLECTIBLE') {
    return {
      at: invoice.uncollectibleAt,
      dueAt,
      ending: 'written-off',
      kind: 'ended',
    };
  }
  if (invoice.status === 'VOID') {
    return { at: invoice.voidedAt, dueAt, ending: 'voided', kind: 'ended' };
  }
  if (invoice.status === 'DRAFT' || !invoice.issuedAt) {
    return { kind: 'not-issued' };
  }
  if (!dueAt) {
    return { kind: 'no-due-date' };
  }

  return {
    days: utcDay(Date.parse(dueAt)) - utcDay(now),
    dueAt,
    kind: 'due',
    overdue: isInvoiceOverdue(invoice, now),
  };
}
