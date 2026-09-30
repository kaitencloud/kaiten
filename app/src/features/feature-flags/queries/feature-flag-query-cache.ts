import type { QueryClient } from '@tanstack/react-query';
import type { FeatureFlag, PageFeatureFlag } from '@/api-client';
import {
  featureFlagQueryOptions,
  featureFlagsQueryOptions,
} from './feature-flag-query-options';

function matchesFeatureFlag(
  candidate: FeatureFlag,
  featureFlag: FeatureFlag,
  previousSlug?: string,
) {
  return (
    candidate.id === featureFlag.id ||
    candidate.slug === featureFlag.slug ||
    (previousSlug !== undefined && candidate.slug === previousSlug)
  );
}

export function mergeFeatureFlagIntoCache(
  queryClient: QueryClient,
  featureFlag: FeatureFlag,
  previousSlug?: string,
) {
  queryClient.setQueryData<PageFeatureFlag | undefined>(
    featureFlagsQueryOptions.queryKey,
    (current) => {
      if (!current) {
        return current;
      }

      const index = current.items.findIndex((candidate) =>
        matchesFeatureFlag(candidate, featureFlag, previousSlug),
      );

      if (index < 0) {
        return { ...current, items: [featureFlag, ...current.items] };
      }

      const nextItems = [...current.items];
      nextItems[index] = featureFlag;
      return { ...current, items: nextItems };
    },
  );

  if (featureFlag.slug) {
    queryClient.setQueryData(
      featureFlagQueryOptions(featureFlag.slug).queryKey,
      featureFlag,
    );
  }

  if (previousSlug && featureFlag.slug !== previousSlug) {
    queryClient.removeQueries({
      exact: true,
      queryKey: featureFlagQueryOptions(previousSlug).queryKey,
    });
  }
}

export function revalidateFeatureFlagsListQuery(queryClient: QueryClient) {
  void queryClient
    .invalidateQueries({
      queryKey: featureFlagsQueryOptions.queryKey,
    })
    .catch(() => undefined);
}
