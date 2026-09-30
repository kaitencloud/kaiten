import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { allReleasesOptions } from '@/lib/api/all-pages-query-options';
import { RoutePending } from '@/components/route';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import {
  DeploymentZonesPageContent,
  deploymentZonesQueryOptions,
} from '@/features/deployment-zones';

export const Route = createFileRoute('/releases/deployment-zones')({
  component: DeploymentZonesLayout,
  loader: ({ context }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(allReleasesOptions()),
      context.queryClient.ensureQueryData(deploymentZonesQueryOptions),
      context.queryClient.ensureQueryData(
        releaseManagementOverviewQueryOptions,
      ),
    ]);
  },
  pendingComponent: () => <RoutePending />,
});

function DeploymentZonesLayout() {
  return (
    <DeploymentZonesPageContent>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </DeploymentZonesPageContent>
  );
}
