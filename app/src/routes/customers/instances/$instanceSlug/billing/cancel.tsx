import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CancelSubscriptionDialog } from '@/features/instances';

export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/billing/cancel',
)({
  component: CancelSubscriptionRoute,
  pendingComponent: () => null,
});

function CancelSubscriptionRoute() {
  const navigate = useNavigate();
  const { instanceSlug } = Route.useParams();

  return (
    <CancelSubscriptionDialog
      onClose={() => {
        void navigate({
          params: { instanceSlug },
          to: '/customers/instances/$instanceSlug/billing',
        });
      }}
    />
  );
}
