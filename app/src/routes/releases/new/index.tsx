import { createFileRoute } from '@tanstack/react-router';
import { allComponentsOptions } from '@/lib/api/all-pages-query-options';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import { ReleaseForm } from '@/features/releases';

export const Route = createFileRoute('/releases/new/')({
  component: NewReleaseRoute,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        releaseManagementOverviewQueryOptions,
      ),
      context.queryClient.ensureQueryData(allComponentsOptions()),
    ]),
  pendingComponent: () => null,
});

function NewReleaseRoute() {
  return <ReleaseForm />;
}
