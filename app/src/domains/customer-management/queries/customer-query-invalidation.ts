import type { QueryClient } from '@tanstack/react-query';
import {
  getCustomerQueryKey,
  listCustomersQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { customersWithInstancesQueryOptions } from './use-customers-with-instances';

export async function invalidateCustomerQueries(
  queryClient: QueryClient,
  customerSlug?: string,
) {
  const invalidations: Array<Promise<void>> = [
    queryClient.invalidateQueries({ queryKey: listCustomersQueryKey() }),
    queryClient.invalidateQueries({
      queryKey: customersWithInstancesQueryOptions.queryKey,
    }),
  ];

  if (customerSlug) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: getCustomerQueryKey({ path: { customerSlug } }),
      }),
    );
  }

  await Promise.all(invalidations);
}

/**
 * Reconciles the cache after a customer has been deleted. DELETE /customers is
 * a hard delete, so the customer's detail query has nothing left to
 * revalidate: invalidating it -- what invalidateCustomerQueries does when it is
 * given a slug -- makes React Query refetch a row the server has already
 * dropped, and the generated client retries three times with backoff before
 * that fetch fails. The cached entry is dropped instead, so a Back navigation
 * cannot resurrect the detail page either.
 *
 * Call this only once nothing is observing the customer any more. Removing a
 * query that still has an active observer -- the detail route holds one through
 * useSuspenseQuery, and so does its page content -- only makes it fetch the
 * dead row again on the next render, which is the same failure by another
 * route.
 */
export async function forgetDeletedCustomerQueries(
  queryClient: QueryClient,
  customerSlug: string,
) {
  queryClient.removeQueries({
    queryKey: getCustomerQueryKey({ path: { customerSlug } }),
  });
  await invalidateCustomerQueries(queryClient);
}
