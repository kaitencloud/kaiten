import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { VoucherWizardPage, voucherQueryOptions } from '@/features/vouchers';

// A draft is finished in the wizard that made it. A voucher that is published, or was
// closed, takes no such edit: its page is where it goes, and where its own edit is.
export const Route = createFileRoute('/catalog/vouchers/$voucherId/edit')({
  component: EditVoucherRoute,
  beforeLoad: async ({ context, params }) => {
    const voucher = await context.queryClient.ensureQueryData(
      voucherQueryOptions(params.voucherId),
    );

    if (voucher.status !== 'DRAFT') {
      throw redirect({ params, to: '/catalog/vouchers/$voucherId' });
    }
  },
});

function EditVoucherRoute() {
  const { voucherId } = Route.useParams();
  const { data: draft } = useSuspenseQuery(voucherQueryOptions(voucherId));

  return <VoucherWizardPage draft={draft} key={draft.id} />;
}
