import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  addonCompatibilityQueryOptions,
  addonLicenseFamiliesQueryOptions,
} from '@/domains/billing';
import {
  AddonGrantsTab,
  addonGrantsQueryOptions,
  addonQueryOptions,
  entitlementsQueryOptions,
} from '@/features/addons';
import i18n from '@/lib/i18n/config';

// `?grant=new` opens the dialog on a new grant, `?grant=<entitlement>` on that grant.
const grantsSearchSchema = z.object({ grant: z.string().optional() });

export const Route = createFileRoute('/catalog/addons/$addonSlug/entitlements')(
  {
    component: AddonGrantsRoute,
    validateSearch: (search) => grantsSearchSchema.parse(search),
    beforeLoad: () => ({
      getTitle: () => i18n.t('Pages.Entitlements.title'),
    }),
    loader: async ({ context, params: { addonSlug } }) => {
      await Promise.all([
        context.queryClient.ensureQueryData(addonQueryOptions(addonSlug)),
        context.queryClient.ensureQueryData(addonGrantsQueryOptions(addonSlug)),
        context.queryClient.ensureQueryData(entitlementsQueryOptions),
        // What the licenses the version fits allow, to warn when a grant lowers it: a
        // reading of licenses the tab does without, so a prefetch that never throws.
        context.queryClient.prefetchQuery(
          addonCompatibilityQueryOptions(addonSlug),
        ),
        context.queryClient.prefetchQuery(addonLicenseFamiliesQueryOptions()),
      ]);
    },
  },
);

function AddonGrantsRoute() {
  const { addonSlug } = Route.useParams();
  const { grant } = Route.useSearch();

  return <AddonGrantsTab addonSlug={addonSlug} grantParam={grant} />;
}
