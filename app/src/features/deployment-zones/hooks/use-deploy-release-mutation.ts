import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import { listDeploymentZonesQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { releaseManagementOverviewBaseQueryKey } from '@/domains/release-management';
import { logger } from '@/lib/logger';
import { saveDeploymentZoneOnFresh } from '../queries/deployment-zone-save';

type UseDeployReleaseMutationOptions = {
  onSuccess?: () => void;
};

export function useDeployReleaseMutation({
  onSuccess,
}: UseDeployReleaseMutationOptions = {}) {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  return useMutation({
    mutationFn: saveDeploymentZoneOnFresh,
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
        deploymentZoneName: variables.edited.name,
        deploymentZoneSlug: variables.deploymentZoneSlug,
        releaseId: variables.edited.releaseId ?? null,
      });
      toast.success(t('Features.Releases.Success.releaseDeployed'));
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });
}
