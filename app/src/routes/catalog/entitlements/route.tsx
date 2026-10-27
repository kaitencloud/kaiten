import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { RoutePending } from '@/components/route';
import {
  entitlementGroupsQueryOptions,
  entitlementsQueryOptions,
} from '@/features/entitlements';

export const Route = createFileRoute('/catalog/entitlements')({
  component: EntitlementsLayout,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(entitlementsQueryOptions),
      context.queryClient.ensureQueryData(entitlementGroupsQueryOptions),
    ]),
  pendingComponent: () => <RoutePending />,
});

function EntitlementsLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
