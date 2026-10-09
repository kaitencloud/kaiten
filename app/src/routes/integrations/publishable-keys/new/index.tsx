import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PublishableKeyFormDialog } from '@/features/publishable-keys';

export const Route = createFileRoute('/integrations/publishable-keys/new/')({
  component: NewPublishableKeyRoute,
  pendingComponent: () => null,
});

function NewPublishableKeyRoute() {
  const navigate = useNavigate();

  return (
    <PublishableKeyFormDialog
      onClose={() => {
        void navigate({
          search: (previous) => previous,
          to: '/integrations/publishable-keys',
        });
      }}
    />
  );
}
