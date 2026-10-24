import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ActionGate } from '@/domains/billing';
import { SchedulePlanChangeDialog } from '@/features/instances';

export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/billing/plan-change',
)({
  component: SchedulePlanChangeRoute,
  pendingComponent: () => null,
});

function SchedulePlanChangeRoute() {
  const navigate = useNavigate();
  const { instanceSlug } = Route.useParams();

  return (
    <ActionGate action="subscription.schedulePlanChange">
      <SchedulePlanChangeDialog
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
