import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { BillingNotFound, requireBillingCapability } from '@/domains/billing';

export const Route = createFileRoute('/invoices')({
  component: InvoicesLayout,
  // Shown in place of the screen where billing is not there, and for a path under
  // /invoices that is no page.
  notFoundComponent: BillingNotFound,
  // The guard of every route under /invoices: the invoices exist where
  // GET /billing/capabilities says billing is on. Where it does not, the guard
  // throws a not-found that carries why, so that no route below it loads anything,
  // and BillingUnavailable explains instead of the screen: a link to an invoice
  // never fails, and nothing billing-related is requested.
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient);
  },
});

function InvoicesLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
