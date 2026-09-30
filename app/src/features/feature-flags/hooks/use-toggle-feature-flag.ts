import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type { FeatureFlag } from '@/api-client';
import { updateFeatureFlagMutation } from '@/api-client/@tanstack/react-query.gen';
import { logger } from '@/lib/logger';
import {
  mergeFeatureFlagIntoCache,
  revalidateFeatureFlagsListQuery,
} from '../queries';

export function useToggleFeatureFlag() {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  const mutation = useMutation({
    ...updateFeatureFlagMutation(),
  });

  const toggle = (flag: FeatureFlag) => {
    const { id, ...writable } = flag;
    const nextEnabled = !flag.enabled;

    mutation.mutate(
      {
        path: { featureFlagSlug: flag.slug! },
        body: {
          ...writable,
          enabled: nextEnabled,
        },
      },
      {
        onSuccess: (_data, variables) => {
          mergeFeatureFlagIntoCache(
            queryClient,
            {
              ...flag,
              ...variables.body,
            },
            flag.slug,
          );
          revalidateFeatureFlagsListQuery(queryClient);
          logger.track('feature_flag_toggled', {
            enabled: nextEnabled,
            featureFlagId: id,
            featureFlagSlug: flag.slug,
            previousEnabled: flag.enabled,
          });
          toast.success(
            flag.enabled
              ? t('Pages.FeatureFlags.Card.disabledSuccess')
              : t('Pages.FeatureFlags.Card.enabledSuccess'),
          );
        },
        onError: (error) => {
          toast.error(getApiErrorMessage(error));
        },
      },
    );
  };

  return { toggle, isPending: mutation.isPending };
}
