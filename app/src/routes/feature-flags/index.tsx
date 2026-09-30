import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  FeatureFlagsPageContent,
  featureFlagsQueryOptions,
} from '@/features/feature-flags';

const featureFlagsSearchSchema = z.object({
  view: z.enum(['list', 'table']).optional(),
});

export const Route = createFileRoute('/feature-flags/')({
  component: FeatureFlagsComponent,
  validateSearch: (search) => featureFlagsSearchSchema.parse(search),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(featureFlagsQueryOptions),
});

function FeatureFlagsComponent() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const { data: featureFlags } = useSuspenseQuery(featureFlagsQueryOptions);
  const viewMode = search.view ?? 'table';

  const handleViewModeChange = (nextView: 'list' | 'table') => {
    navigate({
      replace: true,
      search: nextView === 'table' ? {} : { view: nextView },
    });
  };

  return (
    <FeatureFlagsPageContent
      featureFlags={featureFlags?.items ?? []}
      viewMode={viewMode}
      onViewModeChange={handleViewModeChange}
    />
  );
}
