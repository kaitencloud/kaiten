import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { BillingNotFound, requireBillingCapability } from '@/domains/billing';
import {
  entitlementsQueryOptions,
  LicensePricesTab,
  licenseEntitlementsQueryOptions,
  licensePricesQueryOptions,
} from '@/features/licenses';
import i18n from '@/lib/i18n/config';

// `?price=new` opens the drawer on a new price, `?price=<id>` on that price.
const pricesSearchSchema = z.object({ price: z.string().optional() });

export const Route = createFileRoute('/licenses/$licenseSlug/prices')({
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
  loader: async ({ context, params: { licenseSlug } }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        licensePricesQueryOptions(licenseSlug),
      ),
      context.queryClient.ensureQueryData(
        licenseEntitlementsQueryOptions(licenseSlug),
      ),
      context.queryClient.ensureQueryData(entitlementsQueryOptions),
    ]);
  },
});

function LicensePricesRoute() {
  const { licenseSlug } = Route.useParams();
  const { price } = Route.useSearch();

  return <LicensePricesTab licenseSlug={licenseSlug} priceParam={price} />;
}
