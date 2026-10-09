import { createFileRoute } from '@tanstack/react-router';
import { AddonOverviewTab } from '@/features/addons';

export const Route = createFileRoute('/addons/$addonSlug/')({
  component: AddonOverviewRoute,
});

function AddonOverviewRoute() {
  const { addonSlug } = Route.useParams();

  return <AddonOverviewTab addonSlug={addonSlug} />;
}
