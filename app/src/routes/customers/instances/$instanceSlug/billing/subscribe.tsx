import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SubscribeInstanceDialog } from '@/features/instances';

export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/billing/subscribe',
)({
  component: SubscribeInstanceRoute,
  pendingComponent: () => null,
});

function SubscribeInstanceRoute() {
  const navigate = useNavigate();
  const { instanceSlug } = Route.useParams();

  return (
    <SubscribeInstanceDialog
      onClose={() => {
        void navigate({
          params: { instanceSlug },
          to: '/customers/instances/$instanceSlug/billing',
        });
      }}
    />
  );
}
