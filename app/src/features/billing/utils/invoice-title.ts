import type { TFunction } from 'i18next';
import type { InvoiceSummary } from '@/api-client';
import { formatUtcDate, getInvoiceKindLabelKey } from '@/domains/billing';

/**
 * What an invoice is called: its kind and the boundary it bills, `Renewal invoice,
 * Apr 1, 2026 (UTC)`. An invoice has no number of its own in the API, and its id
 * is a key an accounting system deduplicates on, not a name. The title of the page
 * and the trail of its breadcrumb are this.
 */
export function getInvoiceTitle(
  invoice: Pick<InvoiceSummary, 'boundaryAt' | 'kind'>,
  t: TFunction,
  language: string,
): string {
  return t('Pages.Billing.Invoices.Detail.title', {
    date: formatUtcDate(invoice.boundaryAt, language),
    kind: t(getInvoiceKindLabelKey(invoice.kind)),
  });
}
