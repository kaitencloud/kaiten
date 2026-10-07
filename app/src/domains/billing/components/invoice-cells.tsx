import { useTranslation } from 'react-i18next';
import type { InvoiceSummary } from '@/api-client';
import { formatUtcDate, getInvoiceKindLabelKey } from '../logic';
import { Money } from './money';

/**
 * Who an invoice is for: the customer by name, the instance by its slug under it.
 * The two cells of an invoice that every table of invoices opens with.
 */
export function InvoiceCustomerCell({
  invoice,
}: {
  invoice: Pick<InvoiceSummary, 'customerName' | 'instanceSlug'>;
}) {
  return (
    <div className="min-w-0">
      <span className="font-medium">{invoice.customerName}</span>
      <span className="block font-mono text-xs text-muted-foreground">
        {invoice.instanceSlug}
      </span>
    </div>
  );
}

/** What an invoice is and the boundary it bills, the date in UTC under the kind. */
export function InvoiceKindCell({
  invoice,
}: {
  invoice: Pick<InvoiceSummary, 'boundaryAt' | 'kind'>;
}) {
  const { i18n, t } = useTranslation();

  return (
    <div>
      <span>{t(getInvoiceKindLabelKey(invoice.kind))}</span>
      <span className="block text-xs text-muted-foreground">
        {formatUtcDate(invoice.boundaryAt, i18n.language)}
      </span>
    </div>
  );
}

/** What an invoice comes to, aligned right under a header that is too. */
export function InvoiceTotalCell({
  invoice,
}: {
  invoice: Pick<InvoiceSummary, 'currency' | 'total'>;
}) {
  return (
    <div className="text-right">
      <Money
        amount={invoice.total}
        className="font-medium"
        currency={invoice.currency}
      />
    </div>
  );
}
