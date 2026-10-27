import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type { FeatureFlag } from '@/api-client';
import { logger } from '@/lib/logger';
import {
  mergeFeatureFlagIntoCache,
  revalidateFeatureFlagsListQuery,
  saveFeatureFlagOnFresh,
} from '../queries';
import { getFeatureFlagFormInitialValues } from '../utils/feature-flag-form-values';

export function useToggleFeatureFlag() {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  const mutation = useMutation({
    mutationFn: saveFeatureFlagOnFresh,
  });

  // The flag is read again and only the switch is put on top of it: the rules and
  // the variants another tab saved since the list loaded are not taken back.
  const toggle = (flag: FeatureFlag) => {
    const { id } = flag;
    const nextEnabled = !flag.enabled;
    const opened = getFeatureFlagFormInitialValues(flag);

    mutation.mutate(
      {
        edited: { ...opened, enabled: nextEnabled },
        featureFlagSlug: flag.slug!,
        opened,
      },
      {
        onSuccess: (sent) => {
          mergeFeatureFlagIntoCache(
            queryClient,
            {
              ...flag,
              ...sent,
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
