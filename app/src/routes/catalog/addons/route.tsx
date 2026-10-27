import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { BillingNotFound, requireBillingCapability } from '@/domains/billing';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/catalog/addons')({
  component: AddonsLayout,
  // Shown in place of the screen where billing, or this release's add-ons, is not
  // there, and for a path under /catalog/addons that is no page.
  notFoundComponent: BillingNotFound,
  // The guard of every route under /catalog/addons: the add-ons exist where
  // GET /billing/capabilities says billing is on and this release ships them. Where
  // they do not, the guard throws a not-found that carries why, so that no route below
  // it loads anything, and BillingUnavailable explains instead of the screen: a link to
  // an add-ons page never fails, and nothing of the catalogue is requested.
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient, 'addons');

    return { getTitle: () => i18n.t('Pages.Addons.title') };
  },
});

function AddonsLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
