import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { Instance } from '@/api-client';
import { InstanceFormDialog, InstancesPageContent } from '@/features/instances';

export const Route = createFileRoute('/customers/instances/new/')({
  component: NewInstanceRoute,
  pendingComponent: () => null,
});

function NewInstanceRoute() {
  const navigate = useNavigate();
  const backToList = () => {
    navigate({ to: '/customers/instances' });
  };
  // Land on what was just created: the next step is almost always to deploy
  // to it or to check it, not to find it again in the list.
  const openCreatedInstance = (instance: Instance) => {
    if (!instance.slug) {
      backToList();
      return;
    }

    navigate({
      to: '/customers/instances/$instanceSlug',
      params: { instanceSlug: instance.slug },
    });
  };

  return (
    <InstancesPageContent>
      <InstanceFormDialog
        open
        onSuccess={openCreatedInstance}
        onOpenChange={(open) => {
          if (!open) {
            backToList();
          }
        }}
      />
    </InstancesPageContent>
  );
}
