import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Customer, Instance } from '@/api-client';
import {
  handleGetInstance,
  handleGetInstances,
  handleListCustomers,
} from '@/api-client/msw.gen';
import {
  customersWithInstancesQueryOptions,
  forgetDeletedInstanceQueries,
  instancesWithRelationsQueryKey,
  invalidateInstanceQueries,
  invalidateInstancesListQueries,
  useInstancesWithRelations,
} from '@/domains/customer-management';
import {
  allCustomersOptions,
  allInstancesOptions,
} from '@/lib/api/all-pages-query-options';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import { instanceQueryOptions } from './instance-detail';

const instance = (slug: string) => ({ name: slug, slug }) as Instance;

/**
 * Fills the cache as the screens do, through the query options and the hook
 * they read with, answered over the network: the instance lists (REST and
 * GraphQL with relations), the customer lists the instances count in, and the
 * details of instance-a and instance-b. Returns how many times the API was
 * asked for each detail.
 */
async function cacheInstanceReads(queryClient: QueryClient) {
  const detailReads: Record<string, number> = {};
  server.use(
    handleGetInstances({
      body: {
        hasMore: false,
        items: [instance('instance-a'), instance('instance-b')],
      },
    }),
    handleGetInstance(({ params }) => {
      detailReads[params.instanceSlug] =
        (detailReads[params.instanceSlug] ?? 0) + 1;
      return HttpResponse.json(instance(params.instanceSlug));
    }),
    handleListCustomers({
      body: { hasMore: false, items: [{ name: 'Acme' } as Customer] },
    }),
    graphqlOperationHandler({
      GetCustomersWithInstances: () => ({
        customers: { hasMore: false, items: [], nextCursor: null },
      }),
      GetInstancesWithRelations: () => ({
        instances: { hasMore: false, items: [], nextCursor: null },
      }),
    }),
  );

  await Promise.all([
    queryClient.fetchQuery(allInstancesOptions()),
    queryClient.fetchQuery(allCustomersOptions()),
    queryClient.fetchQuery(customersWithInstancesQueryOptions),
    queryClient.fetchQuery(instanceQueryOptions('instance-a')),
    queryClient.fetchQuery(instanceQueryOptions('instance-b')),
  ]);

  // The instances page reads its list through a hook, which owns the query
  // function: mount it until the list is cached, then leave the page.
  const { result, unmount } = renderHook(() => useInstancesWithRelations(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  unmount();

  return detailReads;
}

/**
 * Whether each read is invalidated, looked up under the key its query options
 * or its hook cached it with; `undefined` for a read no longer in the cache.
 */
function invalidatedReads(queryClient: QueryClient) {
  const isInvalidated = (queryKey: QueryKey) =>
    queryClient.getQueryState(queryKey)?.isInvalidated;

  return {
    instances: isInvalidated(allInstancesOptions().queryKey),
    instancesWithRelations: isInvalidated(instancesWithRelationsQueryKey()),
    customers: isInvalidated(allCustomersOptions().queryKey),
    customersWithInstances: isInvalidated(
      customersWithInstancesQueryOptions.queryKey,
    ),
    instanceA: isInvalidated(instanceQueryOptions('instance-a').queryKey),
    instanceB: isInvalidated(instanceQueryOptions('instance-b').queryKey),
  };
}

const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('instance-query-invalidation', () => {
  it('invalidates instance list queries and customer projections together', async () => {
    const queryClient = createQueryClient();
    await cacheInstanceReads(queryClient);

    await invalidateInstancesListQueries(queryClient);

    expect(invalidatedReads(queryClient)).toEqual({
      instances: true,
      instancesWithRelations: true,
      customers: true,
      customersWithInstances: true,
      instanceA: false,
      instanceB: false,
    });
  });

  it('also invalidates the instance detail query for a specific instance', async () => {
    const queryClient = createQueryClient();
    await cacheInstanceReads(queryClient);

    await invalidateInstanceQueries(queryClient, 'instance-a');

    expect(invalidatedReads(queryClient)).toEqual({
      instances: true,
      instancesWithRelations: true,
      customers: true,
      customersWithInstances: true,
      instanceA: true,
      instanceB: false,
    });
  });

  it('drops the detail query of a deleted instance instead of revalidating it', async () => {
    const queryClient = createQueryClient();
    const detailReads = await cacheInstanceReads(queryClient);

    await forgetDeletedInstanceQueries(queryClient, 'instance-a');

    expect(
      queryClient.getQueryState(instanceQueryOptions('instance-a').queryKey),
    ).toBeUndefined();
    // A hard-deleted row has nothing to refetch: revalidating it is what leaves
    // a mounted detail route retrying a 404.
    expect(detailReads).toEqual({ 'instance-a': 1, 'instance-b': 1 });
    expect(invalidatedReads(queryClient)).toStrictEqual({
      instances: true,
      instancesWithRelations: true,
      customers: true,
      customersWithInstances: true,
      instanceA: undefined,
      instanceB: false,
    });
  });
});
