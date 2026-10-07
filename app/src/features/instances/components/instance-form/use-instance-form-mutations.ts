import { useMutation } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import type { Instance } from '@/api-client';
import {
  createInstanceMutation,
  getInstanceQueryKey,
  patchInstanceMutation,
  updateInstanceMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { startAttioSyncWatcher } from '@/domains/crm-sync';
import {
  invalidateInstanceQueries,
  invalidateInstancesListQueries,
} from '../../hooks/instance-query-invalidation';

/**
 * The writes of the instance form and what each refreshes: the create, the
 * update of an existing instance, and the PATCH that carries the lifecycle
 * stage, which the API does not take in the PUT body.
 */
export function useInstanceFormMutations(instance?: Instance) {
  const { queryClient } = useRouteContext({ from: '__root__' });

  const createMutation = useMutation({
    ...createInstanceMutation(),
    onSuccess: async (createdInstance) => {
      // Creation lands on the new instance's page. Caching it here lets that
      // route read it instead of fetching it: each list row mounts a closed
      // deployment dialog whose disabled observer sits on this same query, and
      // when the list unmounts mid-fetch that last observer leaving cancels
      // the fetch the route awaits (CancelledError, route error page).
      if (createdInstance.slug) {
        queryClient.setQueryData<Instance>(
          getInstanceQueryKey({ path: { instanceSlug: createdInstance.slug } }),
          createdInstance,
        );
      }
      await invalidateInstancesListQueries(queryClient);
      void startAttioSyncWatcher({
        queryClient,
        entityKind: 'instance',
        entitySlug: createdInstance.slug ?? '',
        integrations: createdInstance.integrations,
      });
    },
  });

  const updateMutation = useMutation({
    ...updateInstanceMutation({ path: { instanceSlug: instance?.slug ?? '' } }),
    onSuccess: async (_updatedInstance, variables) => {
      const instanceSlug = variables.path.instanceSlug;
      const syncWatcher = startAttioSyncWatcher({
        queryClient,
        entityKind: 'instance',
        entitySlug: instanceSlug,
        integrations: instance?.integrations,
        watchForChange: true,
      });
      await invalidateInstanceQueries(queryClient, instanceSlug);
      void syncWatcher;
    },
  });

  // Lifecycle stage is a PATCH-only field, persisted separately from the PUT
  // body once the instance exists (after create or alongside an update).
  const lifecycleMutation = useMutation({
    ...patchInstanceMutation({ path: { instanceSlug: instance?.slug ?? '' } }),
    onSuccess: async (_response, variables) => {
      await invalidateInstanceQueries(queryClient, variables.path.instanceSlug);
    },
  });

  return { createMutation, lifecycleMutation, updateMutation };
}
