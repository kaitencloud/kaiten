import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { RoutePending } from '@/components/route';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import { DeploymentsPageContent } from '@/features/releases';

export const Route = createFileRoute('/releases/deployments')({
  component: DeploymentsLayout,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(releaseManagementOverviewQueryOptions),
  pendingComponent: () => <RoutePending />,
});

function DeploymentsLayout() {
  return (
    <DeploymentsPageContent>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </DeploymentsPageContent>
  );
}
