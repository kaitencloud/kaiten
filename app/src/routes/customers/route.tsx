import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { RoutePending } from '@/components/route';
import { customersWithInstancesQueryOptions } from '@/domains/customer-management';

export const Route = createFileRoute('/customers')({
  component: CustomersLayout,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(customersWithInstancesQueryOptions),
  pendingComponent: () => <RoutePending />,
});

function CustomersLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
