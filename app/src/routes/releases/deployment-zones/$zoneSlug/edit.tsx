import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import {
  DeploymentZoneFormDialog,
  deploymentZonesQueryOptions,
} from '@/features/deployment-zones';

export const Route = createFileRoute(
  '/releases/deployment-zones/$zoneSlug/edit',
)({
  component: EditDeploymentZoneDialog,
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

function EditDeploymentZoneDialog() {
  const navigate = useNavigate();
  const { deploymentZone } = Route.useRouteContext();

  return (
    <DeploymentZoneFormDialog
      deploymentZone={deploymentZone}
      open
      onSuccess={() => {
        navigate({ to: '/releases/deployment-zones' });
      }}
      onOpenChange={(open) => {
        if (!open) {
          navigate({ to: '/releases/deployment-zones' });
        }
      }}
    />
  );
}
