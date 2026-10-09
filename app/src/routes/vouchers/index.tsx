import { createFileRoute } from '@tanstack/react-router';
import { BillingRouteError } from '@/domains/billing';
import { VouchersPageContent, vouchersQueryOptions } from '@/features/vouchers';

export const Route = createFileRoute('/vouchers/')({
  component: VouchersPageContent,
  // The API's own words for why the vouchers could not be read, around the console that
  // still works: a session without the scope that reads them is told which one.
  errorComponent: BillingRouteError,
  // Loads every voucher, like the other list pages load theirs.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(vouchersQueryOptions),
});
