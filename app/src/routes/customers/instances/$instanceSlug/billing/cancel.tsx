import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ActionGate } from '@/domains/billing';
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
    <ActionGate action="subscription.cancel">
      <CancelSubscriptionDialog
        onClose={() => {
          void navigate({
            params: { instanceSlug },
            to: '/customers/instances/$instanceSlug/billing',
          });
        }}
      />
    </ActionGate>
  );
}
