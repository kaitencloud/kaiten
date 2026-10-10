import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { BillingNotFound, requireBillingCapability } from '@/domains/billing';
import {
  InstanceDetailBillingTab,
  instanceBillingQueryOptions,
  instanceInvoicesQueryOptions,
} from '@/features/instances';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/billing',
)({
  component: InstanceBillingRouteLayout,
  // Shown in place of the tab where billing is not there, so that a link to it
  // explains why instead of failing.
  notFoundComponent: BillingNotFound,
  // Billing is the tab's, and the rest of the instance is not: the guard is the
  // route's own, so that an instance whose billing is refused still opens. Where
  // billing is not there it throws before the loader, and nothing of billing is
  // requested but the capabilities.
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient);

    return {
      getTitle: () => i18n.t('Pages.Customers.Instances.Detail.tabs.billing'),
    };
  },
  // Warms what the tab shows first. A prefetch never throws: a refusal is the
  // tab's own to show, with a way to ask again, and does not replace the page by
  // the error of the route.
  loader: async ({ context, params: { instanceSlug } }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(
        instanceBillingQueryOptions(instanceSlug),
      ),
      context.queryClient.prefetchQuery(
        instanceInvoicesQueryOptions(instanceSlug),
      ),
    ]);
  },
});

// The tab is drawn by the layout, so that the dialog its child routes open
// (`subscribe`) stands over a tab that stays where it was.
function InstanceBillingRouteLayout() {
  return (
    <InstanceDetailBillingTab>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </InstanceDetailBillingTab>
  );
}
