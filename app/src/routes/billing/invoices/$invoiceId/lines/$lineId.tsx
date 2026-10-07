import { createFileRoute, notFound } from '@tanstack/react-router';
import { describeInvoiceLine } from '@/domains/billing';
import {
  invoiceQueryOptions,
  LineDrilldownPage,
  lineReportsQueryOptions,
} from '@/features/billing';

export const Route = createFileRoute(
  '/billing/invoices/$invoiceId/lines/$lineId',
)({
  component: LineDrilldownRoute,
  beforeLoad: async ({ context, params: { invoiceId, lineId } }) => {
    const invoice = await context.queryClient.ensureQueryData(
      invoiceQueryOptions(invoiceId),
    );
    const line = invoice.lines.find((candidate) => candidate.id === lineId);
    // A line the invoice does not have, or one nothing was measured for (a base
    // fee, a discount), has no usage to show: it is not a page.
    if (!line || !describeInvoiceLine(line).isMetered) {
      throw notFound();
    }

    return { getTitle: () => line.label };
  },
  // Warms the first page of reports without failing the route: a refusal (the
  // reports are no longer kept) is an answer the page shows.
  loader: async ({ context, params: { invoiceId, lineId } }) => {
    await context.queryClient.prefetchInfiniteQuery(
      lineReportsQueryOptions(invoiceId, lineId),
    );
  },
});

function LineDrilldownRoute() {
  const { invoiceId, lineId } = Route.useParams();

  return <LineDrilldownPage invoiceId={invoiceId} lineId={lineId} />;
}
