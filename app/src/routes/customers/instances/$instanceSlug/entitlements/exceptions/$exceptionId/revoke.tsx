import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { EndExceptionDialog } from '@/features/instances';

export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/entitlements/exceptions/$exceptionId/revoke',
)({
  component: EndExceptionRoute,
  pendingComponent: () => null,
});
function EndExceptionRoute() {
  const navigate = useNavigate();
  const { instanceSlug, exceptionId } = Route.useParams();
  return (
    <EndExceptionDialog
      exceptionId={exceptionId}
      onClose={() => {
        void navigate({
          to: '/customers/instances/$instanceSlug/entitlements',
          params: { instanceSlug },
        });
      }}
    />
  );
}
