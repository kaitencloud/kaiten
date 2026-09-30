import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import {
  DeploymentZoneDetailPageContent,
  deploymentZoneQueryOptions,
  deploymentZonesQueryOptions,
} from '@/features/deployment-zones';
import { releasesQueryOptions } from '@/features/releases';

export const Route = createFileRoute('/releases/deployment-zones_/$zoneSlug')({
  component: DeploymentZoneDetailRouteLayout,
  beforeLoad: async ({ context, params: { zoneSlug } }) => {
    const deploymentZone = await context.queryClient.ensureQueryData(
      deploymentZoneQueryOptions(zoneSlug),
    );

    return { getTitle: () => deploymentZone.name };
  },
  loader: ({ context, params: { zoneSlug } }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(deploymentZoneQueryOptions(zoneSlug)),
      context.queryClient.ensureQueryData(deploymentZonesQueryOptions),
      context.queryClient.ensureQueryData(releasesQueryOptions),
    ]);
  },
});

function DeploymentZoneDetailRouteLayout() {
  const { zoneSlug } = Route.useParams();
  const { data: deploymentZone } = useSuspenseQuery(
    deploymentZoneQueryOptions(zoneSlug),
  );

  return (
    <DeploymentZoneDetailPageContent
      deploymentZone={deploymentZone}
      zoneSlug={zoneSlug}
    >
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </DeploymentZoneDetailPageContent>
  );
}
