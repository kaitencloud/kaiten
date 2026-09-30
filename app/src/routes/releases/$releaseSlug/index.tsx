import { createFileRoute } from '@tanstack/react-router';
import { ReleaseDetailOverviewTab } from '@/features/releases';

export const Route = createFileRoute('/releases/$releaseSlug/')({
  component: ReleaseDetailOverviewRoute,
});

function ReleaseDetailOverviewRoute() {
  return <ReleaseDetailOverviewTab />;
}
