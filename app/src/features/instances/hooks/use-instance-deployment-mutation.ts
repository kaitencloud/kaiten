import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Instance } from '@/api-client';
import {
  listDeploymentZonesQueryKey,
  updateInstanceMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { releaseManagementOverviewBaseQueryKey } from '@/domains/release-management';
import { getApiErrorMessage } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  getInstanceDeploymentMode,
  instanceToDeploymentUpdateInput,
} from '../utils/instance-deployment.utils';
import { invalidateInstanceQueries } from './instance-query-invalidation';

type UseInstanceDeploymentMutationOptions = {
  onSuccess?: () => void;
};

/**
 * Attaches an instance to a deployment zone. Deploying (no previous zone) and
 * migrating (zone already set) are the same PUT — the API decides which domain
 * event to emit — so a single mutation covers both and only the toast differs.
 *
 * Zones own the release currently rolled out, which is what the overview and
 * the zone list read: both caches are invalidated alongside the instance.
 */
export const useInstanceDeploymentMutation = ({
  onSuccess,
}: UseInstanceDeploymentMutationOptions = {}) => {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  const mutation = useMutation({
    ...updateInstanceMutation(),
    onSuccess: async (_updatedInstance, variables) => {
      const instanceSlug = variables.path.instanceSlug;
      await Promise.all([
        invalidateInstanceQueries(queryClient, instanceSlug),
        queryClient.invalidateQueries({
          queryKey: listDeploymentZonesQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: releaseManagementOverviewBaseQueryKey,
        }),
      ]);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });

  return {
    deployInstance: async (instance: Instance, deploymentZoneId: string) => {
      const mode = getInstanceDeploymentMode(instance.deploymentZoneId);

      await mutation.mutateAsync({
        path: { instanceSlug: instance.slug! },
        body: instanceToDeploymentUpdateInput(instance, deploymentZoneId),
      });

      logger.track(
        mode === 'migrate' ? 'instance_migrated' : 'instance_deployed',
        {
          instanceSlug: instance.slug ?? null,
          fromDeploymentZoneId: instance.deploymentZoneId ?? null,
          toDeploymentZoneId: deploymentZoneId,
        },
      );
      toast.success(
        mode === 'migrate'
          ? t('Pages.Customers.Instances.Deployment.migrateSuccess')
          : t('Pages.Customers.Instances.Deployment.deploySuccess'),
      );
    },
    isDeploying: mutation.isPending,
  };
};
