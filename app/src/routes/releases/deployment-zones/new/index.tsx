import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { DeploymentZoneFormDialog } from '@/features/deployment-zones';

export const Route = createFileRoute('/releases/deployment-zones/new/')({
  component: NewDeploymentZoneDialog,
  pendingComponent: () => null,
});

function NewDeploymentZoneDialog() {
  const navigate = useNavigate();
  const backToList = () => {
    navigate({ to: '/releases/deployment-zones' });
  };

  return (
    <DeploymentZoneFormDialog
      open
      onSuccess={backToList}
      onOpenChange={(open) => {
        if (!open) {
          backToList();
        }
      }}
    />
  );
}
