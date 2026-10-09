import { createFileRoute, redirect } from '@tanstack/react-router';

// The Customers tab was folded into Usage, and the overview lists the
// linked licenses. The URL stays reachable and lands on the merged tab.
export const Route = createFileRoute(
  '/catalog/entitlements/$entitlementSlug/customers',
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      params: { entitlementSlug: params.entitlementSlug },
      replace: true,
      to: '/catalog/entitlements/$entitlementSlug/usage',
    });
  },
});
