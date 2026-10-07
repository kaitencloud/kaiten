import { createFileRoute } from '@tanstack/react-router';
import { InvoiceDetailPage } from '@/features/billing';

export const Route = createFileRoute('/billing/invoices/$invoiceId/')({
  component: InvoiceDetailRoute,
});

function InvoiceDetailRoute() {
  const { invoiceId } = Route.useParams();

  return <InvoiceDetailPage invoiceId={invoiceId} />;
}
