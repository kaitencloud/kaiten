import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { BillingRouteError } from '@/domains/billing';
import { voucherQueryOptions } from '@/features/vouchers';

export const Route = createFileRoute('/vouchers/$voucherId')({
  component: VoucherLayout,
  // The API's own words for why the voucher could not be read (a session without the
  // scope is told which one, a stale id is a page that does not exist), with a way to
  // ask again. The routes under it read the same voucher, so they stand on this one.
  errorComponent: BillingRouteError,
  beforeLoad: async ({ context, params: { voucherId } }) => {
    const voucher = await context.queryClient.ensureQueryData(
      voucherQueryOptions(voucherId),
    );

    return { getTitle: () => voucher.name };
  },
  loader: ({ context, params: { voucherId } }) =>
    context.queryClient.ensureQueryData(voucherQueryOptions(voucherId)),
});

// The voucher is read once for the pages under it: its page, and the wizard that finishes
// a draft.
function VoucherLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
