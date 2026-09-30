import { createFileRoute } from '@tanstack/react-router';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import { ReleasesPageContent } from '@/features/releases';

export const Route = createFileRoute('/releases/')({
  component: ReleasesRoute,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(releaseManagementOverviewQueryOptions),
});

function ReleasesRoute() {
  return <ReleasesPageContent />;
}
