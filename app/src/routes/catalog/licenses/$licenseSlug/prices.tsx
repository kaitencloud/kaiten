import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { BillingNotFound, requireBillingCapability } from '@/domains/billing';
import {
  entitlementsQueryOptions,
  LicensePricesTab,
  licenseEntitlementsQueryOptions,
  licensePricesQueryOptions,
  licenseQueryOptions,
} from '@/features/licenses';
import i18n from '@/lib/i18n/config';

// `?price=new` opens the drawer on a new price, `?price=<id>` on that price.
// `?copyFrom=<version>` is left by a copy of that version's prices that stopped
// halfway, and offers to finish it.
const pricesSearchSchema = z.object({
  copyFrom: z.string().optional(),
  price: z.string().optional(),
});

export const Route = createFileRoute('/catalog/licenses/$licenseSlug/prices')({
  component: LicensePricesRoute,
  validateSearch: (search) => pricesSearchSchema.parse(search),
  // Shown in place of the tab where billing is not there, so that a link to it
  // explains why instead of failing.
  notFoundComponent: BillingNotFound,
  // Prices are billing's, and the Overview tab is not: the guard is the tab's
  // own, so that a version with no billing still opens. Where billing is not
  // there it throws before the loader, and nothing of billing is requested but
  // the capabilities.
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient);

    return { getTitle: () => i18n.t('Pages.Licenses.Prices.title') };
  },
  loaderDeps: ({ search: { copyFrom } }) => ({ copyFrom }),
  loader: async ({ context, deps: { copyFrom }, params: { licenseSlug } }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        licensePricesQueryOptions(licenseSlug),
      ),
      context.queryClient.ensureQueryData(
        licenseEntitlementsQueryOptions(licenseSlug),
      ),
      context.queryClient.ensureQueryData(entitlementsQueryOptions),
      // The version a copy of prices comes from: what is left to copy is read
      // from it. Its absence is not a failure of this tab.
      copyFrom
        ? Promise.all([
            context.queryClient.ensureQueryData(licenseQueryOptions(copyFrom)),
            context.queryClient.ensureQueryData(
              licensePricesQueryOptions(copyFrom),
            ),
          ]).catch(() => undefined)
        : undefined,
    ]);
  },
});

function LicensePricesRoute() {
  const { licenseSlug } = Route.useParams();
  const { copyFrom, price } = Route.useSearch();

  return (
    <LicensePricesTab
      copyFrom={copyFrom}
      licenseSlug={licenseSlug}
      priceParam={price}
    />
  );
}
