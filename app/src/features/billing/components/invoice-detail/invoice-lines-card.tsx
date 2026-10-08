import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Invoice, InvoiceLine } from '@/api-client';
import { InvoiceLinesTable, InvoiceTotals } from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';
import { InvoiceLineDetail } from './invoice-line-detail';

type InvoiceLinesCardProps = {
  invoice: Invoice;
};

/**
 * What the invoice bills, line by line in the order the API composed them, and
 * what it comes to. Each line has its own service period, its arithmetic in the
 * API's words and, when it was measured, what it was measured from. The totals are
 * the invoice's own fields: the console adds nothing up, so a total that disagrees
 * with its lines is the API's to explain, not something to fix up here.
 */
export function InvoiceLinesCard({ invoice }: InvoiceLinesCardProps) {
  const { t } = useTranslation();
  const renderLineDetail = useCallback(
    (line: InvoiceLine) => (
      <InvoiceLineDetail invoiceId={invoice.id} line={line} />
    ),
    [invoice.id],
  );

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title className="text-base">
          {t('Pages.Billing.Invoices.Detail.Lines.title')}
        </DetailCard.Title>
      </DetailCard.Header>
      <DetailCard.Content className="gap-4">
        <InvoiceLinesTable
          currency={invoice.currency}
          lines={invoice.lines}
          renderLineDetail={renderLineDetail}
        />
        <InvoiceTotals
          currency={invoice.currency}
          discountTotal={invoice.discountTotal}
          subtotal={invoice.subtotal}
          total={invoice.total}
        />
      </DetailCard.Content>
    </DetailCard>
  );
}
