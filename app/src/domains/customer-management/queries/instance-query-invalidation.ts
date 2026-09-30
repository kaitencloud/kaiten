import type { QueryClient } from '@tanstack/react-query';
import {
  getInstanceQueryKey,
  getInstancesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { invalidateCustomerQueries } from './customer-query-invalidation';
import { instancesWithRelationsBaseQueryKey } from './use-instances-with-relations';

export async function invalidateInstancesListQueries(queryClient: QueryClient) {
  await Promise.all([
    invalidateCustomerQueries(queryClient),
    queryClient.invalidateQueries({
      queryKey: getInstancesQueryKey(),
    }),
    queryClient.invalidateQueries({
      queryKey: instancesWithRelationsBaseQueryKey,
    }),
  ]);
}

export async function invalidateInstanceQueries(
  queryClient: QueryClient,
  instanceSlug: string,
) {
  await Promise.all([
    invalidateInstancesListQueries(queryClient),
    queryClient.invalidateQueries({
      queryKey: getInstanceQueryKey({ path: { instanceSlug } }),
    }),
  ]);
}

/**
 * Reconciles the cache after an instance has been deleted. DELETE /instances
 * is a hard delete, so the instance's detail query has nothing left to
 * revalidate: invalidating it -- what invalidateInstanceQueries does -- makes
 * React Query refetch a row the server has already dropped, and the generated
 * client retries three times with backoff before that fetch fails. The cached
 * entry is dropped instead, so a Back navigation cannot resurrect the detail
 * page either.
 *
 * Call this only once nothing is observing the instance any more. Removing a
 * query that still has an active observer -- the detail route holds one
 * through useSuspenseQuery -- only makes it fetch the dead row again on the
 * next render, which is the same failure by another route.
 */
export async function forgetDeletedInstanceQueries(
  queryClient: QueryClient,
  instanceSlug: string,
) {
  queryClient.removeQueries({
    queryKey: getInstanceQueryKey({ path: { instanceSlug } }),
  });
  await invalidateInstancesListQueries(queryClient);
}
