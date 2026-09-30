import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import {
  DeployReleaseDialog,
  deploymentZonesQueryOptions,
} from '@/features/deployment-zones';
import { releasesQueryOptions } from '@/features/releases';

export const Route = createFileRoute(
  '/releases/deployment-zones/$zoneSlug/deploy',
)({
  component: DeployReleaseDialogRoute,
  pendingComponent: () => null,
  beforeLoad: async ({ context, params: { zoneSlug } }) => {
    const zones = await context.queryClient.ensureQueryData(
      deploymentZonesQueryOptions,
    );
    const zone = zones?.items.find((z) => z.slug === zoneSlug);

    if (!zone) {
      throw notFound();
    }

    return {
      deploymentZone: zone,
      getTitle: () => zone.name,
    };
  },
});

function DeployReleaseDialogRoute() {
  const navigate = useNavigate();
  const { deploymentZone } = Route.useRouteContext();
  const { data: releases } = useSuspenseQuery(releasesQueryOptions);

  return (
    <DeployReleaseDialog
      deploymentZone={deploymentZone}
      releases={releases?.items ?? []}
      open
      onOpenChange={(open) => {
        if (!open) {
          navigate({ to: '/releases/deployment-zones' });
        }
      }}
    />
  );
}
