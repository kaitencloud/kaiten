import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import {
  createDeploymentZoneMutation,
  listDeploymentZonesQueryKey,
  updateDeploymentZoneMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { releaseManagementOverviewBaseQueryKey } from '@/domains/release-management';
import { useAppForm } from '@/hooks/form';
import { deploymentZoneFormSchema } from '../schemas/deployment-zone.schema';
import type { DeploymentZoneFormProps } from '../types';
import { deploymentZoneFormValuesToWriteBody } from '../utils/deployment-zone-form.shared';

export const useDeploymentZoneForm = ({
  deploymentZone,
  onSuccess,
  prepareValues,
}: DeploymentZoneFormProps) => {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  const isEditing = !!deploymentZone;

  // Create mutation
  const createMutation = useMutation({
    ...createDeploymentZoneMutation(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: listDeploymentZonesQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: releaseManagementOverviewBaseQueryKey,
        }),
      ]);
      onSuccess?.();
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    ...updateDeploymentZoneMutation(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: listDeploymentZonesQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: releaseManagementOverviewBaseQueryKey,
        }),
      ]);
      onSuccess?.();
    },
  });

  // Create form with TanStack Form
  const form = useAppForm({
    defaultValues: deploymentZone
      ? {
          name: deploymentZone.name,
          type: deploymentZone.type,
          description: deploymentZone.description,
          metadata: deploymentZone.metadata,
          releaseId: deploymentZone.releaseId,
          slug: deploymentZone.slug ?? '',
        }
      : {
          name: '',
          type: 'development',
          description: '',
          metadata: undefined,
          releaseId: undefined,
          slug: '',
        },
    validators: {
      onChange: deploymentZoneFormSchema as any,
    },
    onSubmit: async ({ value }) => {
      const preparedValue = prepareValues?.(value) ?? value;
      const body = deploymentZoneFormValuesToWriteBody(
        preparedValue,
        isEditing,
      );

      try {
        if (isEditing && deploymentZone) {
          await updateMutation.mutateAsync({
            path: { deploymentZoneSlug: deploymentZone.slug! },
            body,
          });
          toast.success(t('Features.Releases.Success.zoneUpdated'));
        } else {
          await createMutation.mutateAsync({
            body,
          });
          toast.success(t('Features.Releases.Success.zoneCreated'));
        }
      } catch (e) {
        toast.error(getApiErrorMessage(e));
      }
    },
  });

  return {
    form,
    isEditing,
    isLoading: createMutation.isPending || updateMutation.isPending,
  };
};
