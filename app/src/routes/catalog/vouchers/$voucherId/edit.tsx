import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  VoucherWizardPage,
  voucherQueryOptions,
  warmVoucherReferences,
} from '@/features/vouchers';

// A draft is finished in the wizard that made it. A voucher that is published, or was
// closed, takes no such edit: its page is where it goes, and where its own edit is.
export const Route = createFileRoute('/catalog/vouchers/$voucherId/edit')({
  component: EditVoucherRoute,
  beforeLoad: async ({ context, params }) => {
    // The reads do not depend on the voucher, so they start beside it rather than after
    // it: the router runs `beforeLoad` to its end before the loader. The loader waits
    // for them, and joins these requests instead of asking again. They never throw.
    void warmVoucherReferences(context.queryClient);
    const voucher = await context.queryClient.ensureQueryData(
      voucherQueryOptions(params.voucherId),
    );

    if (voucher.status !== 'DRAFT') {
      throw redirect({ params, to: '/catalog/vouchers/$voucherId' });
    }
  },
  // A draft opens on the review, which names what the voucher refers to: the reads wait
  // for it, so that the review is not drawn with ids.
  loader: ({ context }) => warmVoucherReferences(context.queryClient),
});

function EditVoucherRoute() {
  const { voucherId } = Route.useParams();
  const { data: draft } = useSuspenseQuery(voucherQueryOptions(voucherId));

  return <VoucherWizardPage draft={draft} key={draft.id} />;
}
