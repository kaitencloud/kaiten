import { createFileRoute } from '@tanstack/react-router';
import { FeatureFlagDetailEvaluationTab } from '@/features/feature-flags';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute(
  '/feature-flags/$featureFlagSlug/evaluation',
)({
  component: FeatureFlagDetailEvaluationRoute,
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.FeatureFlags.Detail.tabs.evaluation'),
  }),
});

function FeatureFlagDetailEvaluationRoute() {
  return <FeatureFlagDetailEvaluationTab />;
}
