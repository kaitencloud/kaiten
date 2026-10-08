import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PaymentTermsDialog } from '@/features/instances';

export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/billing/terms',
)({
  component: PaymentTermsRoute,
  pendingComponent: () => null,
});

function PaymentTermsRoute() {
  const navigate = useNavigate();
  const { instanceSlug } = Route.useParams();

  return (
    <PaymentTermsDialog
      onClose={() => {
        void navigate({
          params: { instanceSlug },
          to: '/customers/instances/$instanceSlug/billing',
        });
      }}
    />
  );
}
