import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import {
  listDeploymentZonesQueryKey,
  updateDeploymentZoneMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { releaseManagementOverviewBaseQueryKey } from '@/domains/release-management';
import { logger } from '@/lib/logger';

type UseDeployReleaseMutationOptions = {
  onSuccess?: () => void;
};

export function useDeployReleaseMutation({
  onSuccess,
}: UseDeployReleaseMutationOptions = {}) {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  return useMutation({
    ...updateDeploymentZoneMutation(),
    onSuccess: async (_deploymentZone, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: listDeploymentZonesQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: releaseManagementOverviewBaseQueryKey,
        }),
      ]);
      logger.track('release_deployed', {
        deploymentZoneName: variables.body.name,
        deploymentZoneSlug: variables.path.deploymentZoneSlug,
        releaseId: variables.body.releaseId ?? null,
      });
      toast.success(t('Features.Releases.Success.releaseDeployed'));
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });
}
