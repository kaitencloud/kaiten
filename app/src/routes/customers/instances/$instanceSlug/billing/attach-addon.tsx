import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { requireBillingCapability } from '@/domains/billing';
import { AttachAddonDialog } from '@/features/instances';

export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/billing/attach-addon',
)({
  component: AttachAddonRoute,
  // The tab's own guard has let billing through; this dialog also needs the
  // add-ons, which a release may not have.
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient, 'addons');
  },
  pendingComponent: () => null,
});

function AttachAddonRoute() {
  const navigate = useNavigate();
  const { instanceSlug } = Route.useParams();

  return (
    <AttachAddonDialog
      onClose={() => {
        void navigate({
          params: { instanceSlug },
          to: '/customers/instances/$instanceSlug/billing',
        });
      }}
    />
  );
}
