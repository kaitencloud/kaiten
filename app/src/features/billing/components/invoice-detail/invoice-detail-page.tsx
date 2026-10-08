import { useSuspenseQuery } from '@tanstack/react-query';
import { DetailEntityLayout } from '@/functionals/detail-entity-layout';
import { cn } from '@/lib/utils';
import { invoiceQueryOptions } from '../../queries';
import { isInHandoff } from '../../utils/invoice-handoff';
import { HoldBanner } from './hold-banner';
import { InvoiceDetailHeader } from './invoice-detail-header';
import { InvoiceDetailStats } from './invoice-detail-stats';
import { InvoiceHandoffBlock } from './invoice-handoff-block';
import { InvoiceIdentityCard } from './invoice-identity-card';
import { InvoiceLinesCard } from './invoice-lines-card';
import { InvoiceSummaryCard } from './invoice-summary-card';

type InvoiceDetailPageProps = {
  invoiceId: string;
};

/**
 * One invoice: what it bills, in what status, for whom, and where it stands, with
 * the actions its status offers. The header and the three figures that matter
 * first (the total, the due date, the period) stay in place, as an instance keeps
 * its own, so that a long invoice keeps its actions and its figures in reach; under
 * them come, for a held draft, the reason it was held, then the summary, who it was
 * billed to and, where the invoice is in the handoff queue, the queue, in a row of
 * cards that each end with their content, and the lines under it, across the
 * page, where a metered
 * line leads to the usage it came from. No amount is added up by the console: it
 * reads the invoice as the API composed it, and re-reads it after every action. The
 * one thing it works out is a date: how far the due day is, and whether it has
 * passed. The stripe-only blocks (hosted links, reconciliation, retrying a push)
 * are not here: they belong to an invoice a payment provider collects.
 */
export function InvoiceDetailPage({ invoiceId }: InvoiceDetailPageProps) {
  const { data: invoice } = useSuspenseQuery(invoiceQueryOptions(invoiceId));

  return (
    <DetailEntityLayout>
      <DetailEntityLayout.Top>
        <InvoiceDetailHeader invoice={invoice} />
        <InvoiceDetailStats invoice={invoice} />
      </DetailEntityLayout.Top>
      <DetailEntityLayout.Body>
        {/* No tabs: the content keeps the space the page of a license gives it
            when it has none. */}
        <DetailEntityLayout.Content className="space-y-4 pt-1 pb-6 lg:space-y-6">
          {invoice.holdReason ? <HoldBanner invoice={invoice} /> : null}
          {/* Two columns from `lg`, three from `xl` where the handoff has a card
              of its own, aligned at the top like the cards of an instance: each
              card ends with its content. */}
          <div
            className={cn(
              'grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6',
              isInHandoff(invoice) && 'xl:grid-cols-3',
            )}
          >
            <InvoiceSummaryCard invoice={invoice} />
            <InvoiceIdentityCard invoice={invoice} />
            <InvoiceHandoffBlock
              className="lg:col-span-2 xl:col-span-1"
              invoice={invoice}
            />
          </div>
          <InvoiceLinesCard invoice={invoice} />
        </DetailEntityLayout.Content>
      </DetailEntityLayout.Body>
    </DetailEntityLayout>
  );
}
