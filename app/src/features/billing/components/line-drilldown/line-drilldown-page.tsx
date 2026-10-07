import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Invoice, InvoiceLine } from '@/api-client';
import { NotFound } from '@/components/route/not-found';
import { describeInvoiceLine } from '@/domains/billing';
import { DetailEntityLayout } from '@/functionals/detail-entity-layout';
import { useLineReports } from '../../hooks';
import { invoiceQueryOptions } from '../../queries';
import { LineDrilldownHeader } from './line-drilldown-header';
import { LineReportsSection } from './line-reports-section';
import { LineSummaryCard } from './line-summary-card';

type LineDrilldownPageProps = {
  invoiceId: string;
  lineId: string;
};

type LineDrilldownProps = {
  invoice: Invoice;
  line: InvoiceLine;
  lineId: string;
};

function LineDrilldown({ invoice, line, lineId }: LineDrilldownProps) {
  const { t } = useTranslation();
  const reports = useLineReports(invoice.id, lineId);

  return (
    <DetailEntityLayout>
      <DetailEntityLayout.Top>
        <LineDrilldownHeader
          canExport={!reports.isOutsideRetention}
          invoice={invoice}
          line={line}
        />
      </DetailEntityLayout.Top>
      <DetailEntityLayout.Body>
        {/* The reports scroll with the page. A line whose reports are gone has nothing
            to focus in it, and a keyboard reaches a scrolled region only by focusing it. */}
        <DetailEntityLayout.Content
          aria-label={t('Pages.Billing.Invoices.Drilldown.region')}
          className="space-y-4 pb-6"
          role="region"
          tabIndex={0}
        >
          <LineSummaryCard invoice={invoice} line={line} />
          <LineReportsSection line={line} reports={reports} />
        </DetailEntityLayout.Content>
      </DetailEntityLayout.Body>
    </DetailEntityLayout>
  );
}

/**
 * The usage a metered line was measured from, report by report, so that a figure
 * on an invoice can be checked against what the instance reported: grouped by the
 * window it counted in, with the limit that applied to each report and the
 * moment it changed. The invoice is the one the detail page read, and the
 * reports are read apart from it, so that a refusal of the reports (they are
 * purged after the retention) leaves the line and what the invoice kept of them
 * on screen. A line that is not metered has no reports to show: it is not a page.
 */
export function LineDrilldownPage({
  invoiceId,
  lineId,
}: LineDrilldownPageProps) {
  const { data: invoice } = useSuspenseQuery(invoiceQueryOptions(invoiceId));
  const line = invoice.lines.find((candidate) => candidate.id === lineId);

  if (!line || !describeInvoiceLine(line).isMetered) {
    return <NotFound />;
  }

  return <LineDrilldown invoice={invoice} line={line} lineId={lineId} />;
}
