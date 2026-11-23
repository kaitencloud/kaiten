import { createFileRoute, notFound } from '@tanstack/react-router';
import { BetaFeaturesPageContent } from '@/features/settings';
import i18n from '@/lib/i18n/config';
import { betaFeaturesFlagQueryOptions } from '@/lib/feature-flags';

export const Route = createFileRoute('/settings/beta-features')({
  // Kaiten Cloud only, for the organizations `beta-features` targets: elsewhere
  // the page does not exist, as on self-hosted, and nothing of it is asked.
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.ensureQueryData(
      betaFeaturesFlagQueryOptions,
    );
    if (!enabled) {
      throw notFound();
    }

    return { getTitle: () => i18n.t('Pages.Settings.BetaFeatures.title') };
  },
  component: BetaFeaturesPageContent,
});
