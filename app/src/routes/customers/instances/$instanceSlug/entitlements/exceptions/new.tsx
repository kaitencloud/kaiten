import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CreateExceptionDialog } from '@/features/instances';

export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/entitlements/exceptions/new',
)({
  component: CreateExceptionRoute,
  pendingComponent: () => null,
});
function CreateExceptionRoute() {
  const navigate = useNavigate();
  const { instanceSlug } = Route.useParams();
  return (
    <CreateExceptionDialog
      onClose={() => {
        void navigate({
          to: '/customers/instances/$instanceSlug/entitlements',
          params: { instanceSlug },
        });
      }}
    />
  );
}
