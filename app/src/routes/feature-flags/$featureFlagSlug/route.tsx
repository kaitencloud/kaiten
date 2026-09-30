import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';
import {
  FeatureFlagConfigurePage,
  FeatureFlagDetailPageContent,
  featureFlagQueryOptions,
} from '@/features/feature-flags';

const featureFlagDetailSearchSchema = z
  .object({
    mode: z.enum(['configure']).optional(),
  })
  .loose();

export const Route = createFileRoute('/feature-flags/$featureFlagSlug')({
  component: FeatureFlagDetailRouteLayout,
  validateSearch: (search) => featureFlagDetailSearchSchema.parse(search),
  beforeLoad: async ({ context, params: { featureFlagSlug } }) => {
    const featureFlag = await context.queryClient.ensureQueryData(
      featureFlagQueryOptions(featureFlagSlug),
    );

    return { getTitle: () => featureFlag.name };
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      featureFlagQueryOptions(params.featureFlagSlug),
    ),
});

function FeatureFlagDetailRouteLayout() {
  const { featureFlagSlug } = Route.useParams();
  const search = Route.useSearch();

  const { data: featureFlag } = useSuspenseQuery(
    featureFlagQueryOptions(featureFlagSlug),
  );

  if (search.mode === 'configure') {
    return <FeatureFlagConfigurePage featureFlag={featureFlag} />;
  }

  return (
    <FeatureFlagDetailPageContent
      featureFlag={featureFlag}
      featureFlagSlug={featureFlagSlug}
    >
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </FeatureFlagDetailPageContent>
  );
}
