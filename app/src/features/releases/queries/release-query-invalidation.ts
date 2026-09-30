import type { QueryClient } from '@tanstack/react-query';
import {
  getReleaseBySlugQueryKey,
  listComponentsQueryKey,
  listDeploymentZonesQueryKey,
  listReleasesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { releaseManagementOverviewBaseQueryKey } from '@/domains/release-management';

export async function invalidateReleaseQueries(
  queryClient: QueryClient,
  releaseSlug?: string,
) {
  const invalidations: Array<Promise<void>> = [
    queryClient.invalidateQueries({ queryKey: listReleasesQueryKey() }),
    queryClient.invalidateQueries({ queryKey: listComponentsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: listDeploymentZonesQueryKey() }),
    queryClient.invalidateQueries({
      queryKey: releaseManagementOverviewBaseQueryKey,
    }),
  ];

  if (releaseSlug) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: getReleaseBySlugQueryKey({ path: { releaseSlug } }),
      }),
    );
  }

  await Promise.all(invalidations);
}
