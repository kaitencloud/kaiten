import { createFileRoute } from '@tanstack/react-router';
import { FeatureFlagDetailTargetingTab } from '@/features/feature-flags';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute(
  '/feature-flags/$featureFlagSlug/targeting',
)({
  component: FeatureFlagDetailTargetingRoute,
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.FeatureFlags.Detail.tabs.targeting'),
  }),
});

function FeatureFlagDetailTargetingRoute() {
  return <FeatureFlagDetailTargetingTab />;
}
