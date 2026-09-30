import { createFileRoute } from '@tanstack/react-router';
import { FeatureFlagDetailOverviewTab } from '@/features/feature-flags';

export const Route = createFileRoute('/feature-flags/$featureFlagSlug/')({
  component: FeatureFlagDetailOverviewRoute,
});

function FeatureFlagDetailOverviewRoute() {
  return <FeatureFlagDetailOverviewTab />;
}
