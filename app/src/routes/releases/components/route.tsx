import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { RoutePending } from '@/components/route';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import {
  ComponentsPageContent,
  componentsQueryOptions,
} from '@/features/components';

export const Route = createFileRoute('/releases/components')({
  component: ComponentsLayout,
  loader: ({ context }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(componentsQueryOptions),
      context.queryClient.ensureQueryData(
        releaseManagementOverviewQueryOptions,
      ),
    ]);
  },
  pendingComponent: () => <RoutePending />,
});

function ComponentsLayout() {
  return (
    <ComponentsPageContent>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </ComponentsPageContent>
  );
}
