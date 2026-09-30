import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import { deploymentZonesQueryOptions } from '@/features/deployment-zones';
import {
  ReleaseDetailPageContent,
  releaseQueryOptions,
} from '@/features/releases';

export const Route = createFileRoute('/releases/$releaseSlug')({
  component: ReleaseDetailRouteLayout,
  beforeLoad: async ({ context, params: { releaseSlug } }) => {
    const release = await context.queryClient.ensureQueryData(
      releaseQueryOptions(releaseSlug),
    );

    return { getTitle: () => release.version };
  },
  loader: ({ context, params: { releaseSlug } }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(releaseQueryOptions(releaseSlug)),
      context.queryClient.ensureQueryData(
        releaseManagementOverviewQueryOptions,
      ),
      context.queryClient.ensureQueryData(deploymentZonesQueryOptions),
    ]);
  },
});

function ReleaseDetailRouteLayout() {
  const { releaseSlug } = Route.useParams();
  const { data: release } = useSuspenseQuery(releaseQueryOptions(releaseSlug));

  return (
    <ReleaseDetailPageContent release={release} releaseSlug={releaseSlug}>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </ReleaseDetailPageContent>
  );
}
