import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ComponentFormDialog } from '@/domains/release-management';

export const Route = createFileRoute('/releases/components/new/')({
  component: NewComponentDialog,
  pendingComponent: () => null,
});

function NewComponentDialog() {
  const navigate = useNavigate();
  const backToList = () => {
    navigate({ to: '/releases/components' });
  };

  return (
    <ComponentFormDialog
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
