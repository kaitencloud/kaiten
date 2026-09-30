import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { RoutePending } from '@/components/route';
import { deploymentZonesQueryOptions } from '@/features/deployment-zones';
import { releasesQueryOptions } from '@/features/releases';

export const Route = createFileRoute('/releases')({
  component: ReleasesLayout,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(releasesQueryOptions),
      context.queryClient.ensureQueryData(deploymentZonesQueryOptions),
    ]),
  pendingComponent: () => <RoutePending />,
});

function ReleasesLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
