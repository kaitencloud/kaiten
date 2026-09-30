import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import type { FeatureFlag } from '@/api-client';
import { updateFeatureFlagMutation } from '@/api-client/@tanstack/react-query.gen';
import {
  mergeFeatureFlagIntoCache,
  revalidateFeatureFlagsListQuery,
} from '../queries';
import { getFeatureFlagFormInitialValues } from './use-feature-flag-form';

/**
 * Returns a rename handler for the feature flag detail header. The update
 * endpoint is a full PUT, so the body is rebuilt from the existing flag (the
 * exact same shape the configure form submits) with only the name overridden —
 * no other field is touched.
 */
export function useFeatureFlagRename(featureFlag: FeatureFlag) {
  const { queryClient } = useRouteContext({ from: '__root__' });

  const mutation = useMutation({
    ...updateFeatureFlagMutation(),
    onSuccess: (_data, variables) => {
      mergeFeatureFlagIntoCache(
        queryClient,
        {
          ...featureFlag,
          ...variables.body,
          slug: variables.body.slug || featureFlag.slug,
        },
        variables.path.featureFlagSlug,
      );
      revalidateFeatureFlagsListQuery(queryClient);
    },
  });

  return async (name: string) => {
    await mutation.mutateAsync({
      path: { featureFlagSlug: featureFlag.slug! },
      body: { ...getFeatureFlagFormInitialValues(featureFlag), name } as never,
    });
  };
}
