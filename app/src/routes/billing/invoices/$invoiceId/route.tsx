import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { BillingRouteError } from '@/domains/billing';
import { getInvoiceTitle, invoiceQueryOptions } from '@/features/billing';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/billing/invoices/$invoiceId')({
  component: InvoiceRouteLayout,
  // The API's own words for why an invoice could not be read, around the console
  // that still works: a missing invoice is a page that does not exist.
  errorComponent: BillingRouteError,
  beforeLoad: async ({ context, params: { invoiceId } }) => {
    const invoice = await context.queryClient.ensureQueryData(
      invoiceQueryOptions(invoiceId),
    );

    return {
      getTitle: () => getInvoiceTitle(invoice, i18n.t, i18n.language),
    };
  },
  loader: ({ context, params: { invoiceId } }) =>
    context.queryClient.ensureQueryData(invoiceQueryOptions(invoiceId)),
});

// The invoice, and under it the usage a line was measured from: both read the
// invoice the route loaded.
function InvoiceRouteLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
