import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { BillingRouteError } from '@/domains/billing';
import { VoucherWizardPage, voucherQueryOptions } from '@/features/vouchers';
import i18n from '@/lib/i18n/config';

// `?boostFor=<voucher id>` opens the wizard as the boost that goes with that discount,
// starting from its duration, its eligibility and its limits. The id is the voucher's,
// never its code.
const newVoucherSearchSchema = z.object({ boostFor: z.string().optional() });

export const Route = createFileRoute('/vouchers/new/')({
  component: NewVoucherRoute,
  // The voucher a boost is made for is read here, and may be one that cannot be read.
  errorComponent: BillingRouteError,
  validateSearch: (search) => newVoucherSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ boostFor: search.boostFor }),
  loader: ({ context, deps }) =>
    deps.boostFor
      ? context.queryClient.ensureQueryData(voucherQueryOptions(deps.boostFor))
      : undefined,
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Vouchers.Wizard.title'),
  }),
});

function NewVoucherRoute() {
  const boostFor = Route.useLoaderData();

  // A new wizard for each discount a boost is made for: following "add a boost" from the
  // page that published one must not keep the state of the voucher just made.
  return <VoucherWizardPage boostFor={boostFor} key={boostFor?.id ?? 'new'} />;
}
