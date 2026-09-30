import { createFileRoute } from '@tanstack/react-router';
import { FeatureFlagDetailVariantsTab } from '@/features/feature-flags';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute(
  '/feature-flags/$featureFlagSlug/variants',
)({
  component: FeatureFlagDetailVariantsRoute,
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.FeatureFlags.Detail.tabs.variants'),
  }),
});

function FeatureFlagDetailVariantsRoute() {
  return <FeatureFlagDetailVariantsTab />;
}
