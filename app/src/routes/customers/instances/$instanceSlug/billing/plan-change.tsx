import { createFileRoute, useNavigate } from '@tanstack/react-router';
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
    <SchedulePlanChangeDialog
      onClose={() => {
        void navigate({
          params: { instanceSlug },
          to: '/customers/instances/$instanceSlug/billing',
        });
      }}
    />
  );
}
