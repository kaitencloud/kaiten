import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import { HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Customer } from '@/api-client';
import { getCustomerOptions } from '@/api-client/@tanstack/react-query.gen';
import { handleGetCustomer, handleListCustomers, handleUpdateCustomer } from '@/api-client/msw.gen';
import { updateCustomer } from '@/api-client';
import { allCustomersOptions } from '@/lib/api/all-pages-query-options';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import {
  forgetDeletedCustomerQueries,
  invalidateCustomerQueries,
} from './customer-query-invalidation';
import { customersWithInstancesQueryOptions } from './use-customers-with-instances';

const customer = (slug: string) => ({ name: slug, slug }) as Customer;

// What the customer and the instance detail routes read, each through its own
// customerQueryOptions.
const customerOptions = (customerSlug: string) =>
  getCustomerOptions({ path: { customerSlug } });

/**
 * Fills the cache as the screens do, through the query options they read
 * customers with, answered over the network: the REST list, the GraphQL list
 * with instances, and the details of acme and globex. Returns how many times
 * the API was asked for each detail.
 */
async function cacheCustomerReads(queryClient: QueryClient) {
  const detailReads: Record<string, number> = {};
  server.use(
    handleListCustomers({
      body: { hasMore: false, items: [customer('acme'), customer('globex')] },
    }),
    graphqlOperationHandler({
      GetCustomersWithInstances: () => ({
        customers: { hasMore: false, items: [], nextCursor: null },
      }),
    }),
    handleGetCustomer(({ params }) => {
      detailReads[params.customerSlug] =
        (detailReads[params.customerSlug] ?? 0) + 1;
      return HttpResponse.json(customer(params.customerSlug));
    }),
  );

  await Promise.all([
    queryClient.fetchQuery(allCustomersOptions()),
    queryClient.fetchQuery(customersWithInstancesQueryOptions),
    queryClient.fetchQuery(customerOptions('acme')),
    queryClient.fetchQuery(customerOptions('globex')),
  ]);

  return detailReads;
}

/**
 * Whether each read is invalidated, looked up under the key its query options
 * cached it with; `undefined` for a read no longer in the cache.
 */
function invalidatedReads(queryClient: QueryClient) {
  const isInvalidated = (queryKey: QueryKey) =>
    queryClient.getQueryState(queryKey)?.isInvalidated;

  return {
    customers: isInvalidated(allCustomersOptions().queryKey),
    customersWithInstances: isInvalidated(
      customersWithInstancesQueryOptions.queryKey,
    ),
    acme: isInvalidated(customerOptions('acme').queryKey),
    globex: isInvalidated(customerOptions('globex').queryKey),
  };
}

const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('customer-query-invalidation', () => {
  it('refreshes both REST and GraphQL projections after a real update', async () => {
    const queryClient = createQueryClient();
    let name = 'Before';
    server.use(
      handleListCustomers(() => HttpResponse.json({ hasMore: false, items: [{ name, slug: 'acme' }] })),
      handleUpdateCustomer(async ({ request }) => { name = (await request.json()).name; return HttpResponse.json({ name, slug: 'acme' }); }),
      graphqlOperationHandler({ GetCustomersWithInstances: () => ({ customers: { hasMore: false, items: [{ name, slug: 'acme', instances: [] }] } }) }),
    );
    const rest = new QueryObserver(queryClient, allCustomersOptions());
    const graph = new QueryObserver(queryClient, customersWithInstancesQueryOptions);
    const unsubscribe = [rest.subscribe(() => {}), graph.subscribe(() => {})];
    await Promise.all([rest.refetch(), graph.refetch()]);
    await updateCustomer({ path: { customerSlug: 'acme' }, body: { name: 'After' }, throwOnError: true });
    await invalidateCustomerQueries(queryClient, 'acme');
    expect(rest.getCurrentResult().data?.items[0]?.name).toBe('After');
    expect(graph.getCurrentResult().data?.[0]?.name).toBe('After');
    unsubscribe.forEach((stop) => stop());
    queryClient.clear();
  });
  it('invalidates the customer list projections when no slug is given', async () => {
    const queryClient = createQueryClient();
    await cacheCustomerReads(queryClient);

    await invalidateCustomerQueries(queryClient);

    expect(invalidatedReads(queryClient)).toEqual({
      customers: true,
      customersWithInstances: true,
      acme: false,
      globex: false,
    });
  });

  it('also invalidates the customer detail query for a specific customer', async () => {
    const queryClient = createQueryClient();
    await cacheCustomerReads(queryClient);

    await invalidateCustomerQueries(queryClient, 'acme');

    expect(invalidatedReads(queryClient)).toEqual({
      customers: true,
      customersWithInstances: true,
      acme: true,
      globex: false,
    });
  });

  it('drops the detail query of a deleted customer instead of revalidating it', async () => {
    const queryClient = createQueryClient();
    const detailReads = await cacheCustomerReads(queryClient);

    await forgetDeletedCustomerQueries(queryClient, 'acme');

    expect(
      queryClient.getQueryState(customerOptions('acme').queryKey),
    ).toBeUndefined();
    // A hard-deleted row has nothing to refetch: revalidating it is what leaves
    // a mounted detail route retrying a dead request before it can navigate.
    expect(detailReads).toEqual({ acme: 1, globex: 1 });
    expect(invalidatedReads(queryClient)).toStrictEqual({
      customers: true,
      customersWithInstances: true,
      acme: undefined,
      globex: false,
    });
  });
});
