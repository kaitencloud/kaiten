import { useSuspenseQuery } from '@tanstack/react-query';
import { DetailEntityLayout } from '@/functionals/detail-entity-layout';
import { invoiceQueryOptions } from '../../queries';
import { HoldBanner } from './hold-banner';
import { InvoiceChain } from './invoice-chain';
import { InvoiceDetailHeader } from './invoice-detail-header';
import { InvoiceHandoffBlock } from './invoice-handoff-block';
import { InvoiceIdentityCard } from './invoice-identity-card';
import { InvoiceLinesCard } from './invoice-lines-card';
import { InvoiceSummaryCard } from './invoice-summary-card';

type InvoiceDetailPageProps = {
  invoiceId: string;
};

/**
 * One invoice: what it bills, in what status, for whom, and where it stands, with
 * the actions its status offers. A held draft says why before anything else, a
 * void invoice or its replacement points to the other, and a metered line leads to
 * the usage it came from. Nothing on it is added up or worked out by the console:
 * it reads the invoice as the API composed it, and re-reads it after every action.
 * The stripe-only blocks (hosted links, reconciliation, retrying a push) are not
 * here: they belong to an invoice a payment provider collects.
 */
export function InvoiceDetailPage({ invoiceId }: InvoiceDetailPageProps) {
  const { data: invoice } = useSuspenseQuery(invoiceQueryOptions(invoiceId));

  return (
    <DetailEntityLayout>
      <DetailEntityLayout.Top>
        <InvoiceDetailHeader invoice={invoice} />
      </DetailEntityLayout.Top>
      <DetailEntityLayout.Body>
        <DetailEntityLayout.Content className="space-y-4 pb-6">
          {invoice.holdReason ? <HoldBanner invoice={invoice} /> : null}
          <InvoiceChain invoice={invoice} />
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <InvoiceLinesCard invoice={invoice} />
            </div>
            <div className="space-y-4">
              <InvoiceSummaryCard invoice={invoice} />
              <InvoiceHandoffBlock invoice={invoice} />
              <InvoiceIdentityCard invoice={invoice} />
            </div>
          </div>
        </DetailEntityLayout.Content>
      </DetailEntityLayout.Body>
    </DetailEntityLayout>
  );
}
