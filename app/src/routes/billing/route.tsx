import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { BillingNotFound, requireBillingCapability } from '@/domains/billing';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/billing')({
  component: BillingLayout,
  // Shown in place of the screen where billing is not there, and for a path under
  // /billing that is no page.
  notFoundComponent: BillingNotFound,
  // The guard of every route under /billing: billing exists where
  // GET /billing/capabilities says so. Where it does not, the guard throws a
  // not-found that carries why, so that no route below it loads anything, and
  // BillingUnavailable explains instead of the screen: a link to a billing page
  // never fails, and nothing billing-related is requested.
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient);

    return { getTitle: () => i18n.t('Pages.Billing.title') };
  },
});

function BillingLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
