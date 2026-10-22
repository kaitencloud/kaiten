import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import type { FeatureFlag } from '@/api-client';
import {
  mergeFeatureFlagIntoCache,
  revalidateFeatureFlagsListQuery,
  saveFeatureFlagOnFresh,
} from '../queries';
import { getFeatureFlagFormInitialValues } from '../utils/feature-flag-form-values';

/**
 * Returns a rename handler for the feature flag detail header. The update
 * endpoint is a full PUT, so the flag is read again and only the name is put on
 * top of it (in the exact same shape the configure form submits): the rules and
 * the variants another tab saved since the page loaded are not touched.
 */
export function useFeatureFlagRename(featureFlag: FeatureFlag) {
  const { queryClient } = useRouteContext({ from: '__root__' });

  const mutation = useMutation({
    mutationFn: saveFeatureFlagOnFresh,
    onSuccess: (sent, variables) => {
      mergeFeatureFlagIntoCache(
        queryClient,
        {
          ...featureFlag,
          ...sent,
          slug: sent.slug || featureFlag.slug,
        },
        variables.featureFlagSlug,
      );
      revalidateFeatureFlagsListQuery(queryClient);
    },
  });

  return async (name: string) => {
    const opened = getFeatureFlagFormInitialValues(featureFlag);
    await mutation.mutateAsync({
      edited: { ...opened, name },
      featureFlagSlug: featureFlag.slug!,
      opened,
    });
  };
}
