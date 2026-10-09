import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { addonPricesQueryOptions } from '@/domains/billing';
import { AddonPricesTab, addonQueryOptions } from '@/features/addons';
import i18n from '@/lib/i18n/config';

// `?price=new` opens the drawer on a new price. A price is never edited, so it is the
// only thing the URL can ask.
const pricesSearchSchema = z.object({ price: z.string().optional() });

export const Route = createFileRoute('/addons/$addonSlug/prices')({
  component: AddonPricesRoute,
  validateSearch: (search) => pricesSearchSchema.parse(search),
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Addons.Prices.title'),
  }),
  loader: async ({ context, params: { addonSlug } }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(addonQueryOptions(addonSlug)),
      context.queryClient.ensureQueryData(addonPricesQueryOptions(addonSlug)),
    ]);
  },
});

function AddonPricesRoute() {
  const { addonSlug } = Route.useParams();
  const { price } = Route.useSearch();

  return <AddonPricesTab addonSlug={addonSlug} priceParam={price} />;
}
