import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { requireBillingCapability } from '@/domains/billing';
import { RedeemVoucherDialog } from '@/features/instances';

export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/billing/redeem-voucher',
)({
  component: RedeemVoucherRoute,
  // The tab's own guard has let billing through; this dialog also needs the vouchers,
  // which a release may not have.
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient, 'vouchers');
  },
  pendingComponent: () => null,
});

function RedeemVoucherRoute() {
  const navigate = useNavigate();
  const { instanceSlug } = Route.useParams();

  return (
    <RedeemVoucherDialog
      onClose={() => {
        void navigate({
          params: { instanceSlug },
          to: '/customers/instances/$instanceSlug/billing',
        });
      }}
    />
  );
}
