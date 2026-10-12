import type { InvoiceSummary } from '@/api-client';

/**
 * How two invoices are ordered by what they come to. An amount is an integer in the
 * minor units of its own currency, so 5,000 of JPY is not 5,000 of EUR: the cents of
 * one are a hundred times the units of the other. Amounts of two currencies are
 * therefore never compared. The currencies are put in order first and the amounts
 * only within one, and the console converts nothing between them.
 */
export function compareInvoiceTotals(
  a: Pick<InvoiceSummary, 'currency' | 'total'>,
  b: Pick<InvoiceSummary, 'currency' | 'total'>,
): number {
  if (a.currency !== b.currency) {
    return a.currency < b.currency ? -1 : 1;
  }

  return a.total - b.total;
}
