import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  DeployToZoneDialog,
  deploymentZonesQueryOptions,
} from '@/features/deployment-zones';
import { releaseQueryOptions } from '@/features/releases';

export const Route = createFileRoute('/releases/$releaseSlug/deploy')({
  component: DeployToZoneDialogRoute,
  pendingComponent: () => null,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(deploymentZonesQueryOptions),
});

function DeployToZoneDialogRoute() {
  const navigate = useNavigate();
  const { releaseSlug } = Route.useParams();
  const { data: release } = useSuspenseQuery(releaseQueryOptions(releaseSlug));
  const { data: zones } = useSuspenseQuery(deploymentZonesQueryOptions);

  return (
    <DeployToZoneDialog
      release={release}
      deploymentZones={zones?.items ?? []}
      open
      onOpenChange={(open) => {
        if (!open) {
          navigate({ to: '/releases/$releaseSlug', params: { releaseSlug } });
        }
      }}
    />
  );
}
