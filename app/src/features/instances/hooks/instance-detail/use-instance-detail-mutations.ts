import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PatchInstanceBody, InstanceWritable } from '@/api-client';
import {
  deleteInstanceMutation,
  patchInstanceMutation,
  updateInstanceMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { startAttioSyncWatcher } from '@/domains/crm-sync';
import {
  getInstanceStatusLabel,
  type InstanceStatus,
} from '@/domains/customer-management';
import {
  forgetDeletedInstanceQueries,
  invalidateInstanceQueries,
} from '../instance-query-invalidation';

export const useInstanceDetailMutations = (
  instanceSlug: string,
  integrations?: Record<string, unknown> | null,
) => {
  const { t } = useTranslation();
  const { queryClient } = useRouteContext({ from: '__root__' });

  // No cache work here on purpose. This hook runs on the instance's own detail
  // route, which observes the instance through useSuspenseQuery, and mutateAsync
  // does not resolve until onSuccess has. Touching the deleted instance's detail
  // query while that observer is still mounted refetches a row the server has
  // dropped, and the caller is left waiting on three retries before it can
  // navigate away. The caller reconciles the cache once it has left the route.
  const deleteMutation = useMutation({
    ...deleteInstanceMutation(),
    onSuccess: () => {
      toast.success(t('Pages.Customers.Instances.Mutation.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('Common.deleteError', 'Error deleting instance'));
    },
  });

  const updateMutation = useMutation({
    ...updateInstanceMutation({ path: { instanceSlug } }),
    onSuccess: async (_updatedInstance, variables) => {
      const updatedInstanceSlug = variables.path.instanceSlug;
      const syncWatcher = startAttioSyncWatcher({
        queryClient,
        entityKind: 'instance',
        entitySlug: updatedInstanceSlug,
        integrations,
        watchForChange: true,
      });
      await invalidateInstanceQueries(queryClient, updatedInstanceSlug);
      void syncWatcher;
      toast.success(
        t(
          'Pages.Customers.Instances.Mutation.Form.updateSuccess',
          'Instance updated successfully',
        ),
      );
    },
    onError: () => {
      toast.error(
        t(
          'Pages.Customers.Instances.Mutation.Form.updateError',
          'Error updating instance',
        ),
      );
    },
  });

  const refreshAfterPatch = async (variables: {
    path: { instanceSlug: string };
  }) => {
    const updatedInstanceSlug = variables.path.instanceSlug;
    const syncWatcher = startAttioSyncWatcher({
      queryClient,
      entityKind: 'instance',
      entitySlug: updatedInstanceSlug,
      integrations,
      watchForChange: true,
    });
    await invalidateInstanceQueries(queryClient, updatedInstanceSlug);
    void syncWatcher;
  };
  const onPatchSuccess = async (
    _updatedInstance: void,
    variables: { path: { instanceSlug: string } },
  ) => {
    await refreshAfterPatch(variables);
    toast.success(
      t(
        'Pages.Customers.Instances.Mutation.Form.updateSuccess',
        'Instance updated successfully',
      ),
    );
  };
  const onPatchError = () => {
    toast.error(
      t(
        'Pages.Customers.Instances.Mutation.Form.updateError',
        'Error updating instance',
      ),
    );
  };

  // Status is edited inline from the detail header; lifecycle stage from the
  // instance details card. Both are partial PATCHes on the instance. The status
  // toast is raised by updateInstanceStatus below, because it carries an undo.
  const updateStatusMutation = useMutation({
    ...patchInstanceMutation({ path: { instanceSlug } }),
    onSuccess: (_updatedInstance, variables) => refreshAfterPatch(variables),
    onError: onPatchError,
  });

  const updateLifecycleStageMutation = useMutation({
    ...patchInstanceMutation({ path: { instanceSlug } }),
    onSuccess: onPatchSuccess,
    onError: onPatchError,
  });

  // A status applies on the first click, so it is confirmed afterwards rather
  // than before: the toast offers to put the previous status back.
  const updateInstanceStatus = async (
    body: PatchInstanceBody,
    previousStatus?: InstanceStatus,
  ): Promise<void> => {
    await updateStatusMutation.mutateAsync({
      path: { instanceSlug },
      body,
    });

    const nextStatus = body.status;
    toast.success(
      t('Pages.Customers.Instances.Detail.statusEditor.changed', {
        status: getInstanceStatusLabel(t, nextStatus),
      }),
      previousStatus && nextStatus
        ? {
            action: {
              label: t('Common.undo'),
              onClick: () => {
                void updateInstanceStatus(
                  { status: previousStatus },
                  nextStatus,
                );
              },
            },
          }
        : undefined,
    );
  };

  return {
    deleteInstance: () =>
      deleteMutation.mutateAsync({
        path: { instanceSlug },
      }),
    // Run this after navigating off the instance's route -- see the comment on
    // the delete mutation above.
    forgetDeletedInstance: () =>
      forgetDeletedInstanceQueries(queryClient, instanceSlug),
    isDeleting: deleteMutation.isPending,
    updateInstance: async (body: InstanceWritable) => {
      await updateMutation.mutateAsync({
        path: { instanceSlug },
        body,
      });
    },
    isUpdating: updateMutation.isPending,
    updateInstanceStatus,
    isUpdatingStatus: updateStatusMutation.isPending,
    updateInstanceLifecycleStage: async (body: PatchInstanceBody) => {
      await updateLifecycleStageMutation.mutateAsync({
        path: { instanceSlug },
        body,
      });
    },
    isUpdatingLifecycleStage: updateLifecycleStageMutation.isPending,
  };
};
