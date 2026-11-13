import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  EndExceptionDialog,
  requireExceptionAccess,
} from '@/features/instances';

export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/entitlements/exceptions/$exceptionId/revoke',
)({
  beforeLoad: ({ context: { queryClient }, params }) =>
    requireExceptionAccess(
      queryClient,
      params.instanceSlug,
      params.exceptionId,
    ),
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
