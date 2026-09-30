import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PageDeploymentZone } from '@/api-client';
import {
  deleteDeploymentZoneMutation,
  listDeploymentZonesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { releaseManagementOverviewBaseQueryKey } from '@/domains/release-management';
import type { DeploymentZone } from '../types';

export function useDeleteDeploymentZoneMutation(
  deploymentZone: DeploymentZone,
) {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  return useMutation({
    ...deleteDeploymentZoneMutation(),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: listDeploymentZonesQueryKey(),
      });

      const previousZones = queryClient.getQueryData(
        listDeploymentZonesQueryKey(),
      );

      queryClient.setQueryData<PageDeploymentZone | undefined>(
        listDeploymentZonesQueryKey(),
        (old) => {
          if (!old) {
            return old;
          }

          return {
            ...old,
            items: old.items.filter(
              (zone) => zone.slug !== deploymentZone.slug,
            ),
          };
        },
      );

      return { previousZones };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousZones) {
        queryClient.setQueryData(
          listDeploymentZonesQueryKey(),
          context.previousZones,
        );
      }
      toast.error(t('Features.Releases.deleteZoneError'));
    },
    onSuccess: () => {
      toast.success(t('Features.Releases.Success.zoneDeleted'));
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: listDeploymentZonesQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: releaseManagementOverviewBaseQueryKey,
        }),
      ]);
    },
  });
}
