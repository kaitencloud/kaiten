import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import {
  BillingNotFound,
  BillingRouteError,
  requireBillingCapability,
} from '@/domains/billing';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/catalog/vouchers')({
  component: VouchersLayout,
  // The API's own words when the capabilities could not be read. Each route below
  // that reads something sets its own: a router with a default error component gives
  // every route a boundary, so that an error does not reach this one.
  errorComponent: BillingRouteError,
  // Shown in place of the screen where billing, or this release's vouchers, is not
  // there, and for a path under /catalog/vouchers that is no page.
  notFoundComponent: BillingNotFound,
  // The guard of every route under /catalog/vouchers: the vouchers exist where
  // GET /billing/capabilities says billing is on and this release ships them. Where
  // they do not, the guard throws a not-found that carries why, so that no route below
  // it loads anything, and BillingUnavailable explains instead of the screen: a link to
  // a vouchers page never fails, and nothing of the catalogue is requested.
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient, 'vouchers');

    return { getTitle: () => i18n.t('Pages.Vouchers.title') };
  },
});

function VouchersLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
