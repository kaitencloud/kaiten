import { createFileRoute } from '@tanstack/react-router';
import {
  addonCompatibilityQueryOptions,
  addonLicenseFamiliesQueryOptions,
} from '@/domains/billing';
import { AddonCompatibilityTab } from '@/features/addons';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute(
  '/catalog/addons/$addonSlug/compatibility',
)({
  component: AddonCompatibilityRoute,
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Addons.Compatibility.title'),
  }),
  loader: async ({ context, params: { addonSlug } }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        addonCompatibilityQueryOptions(addonSlug),
      ),
      context.queryClient.ensureQueryData(addonLicenseFamiliesQueryOptions()),
    ]);
  },
});

function AddonCompatibilityRoute() {
  const { addonSlug } = Route.useParams();

  return <AddonCompatibilityTab addonSlug={addonSlug} />;
}
