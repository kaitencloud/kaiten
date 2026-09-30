import { describe, expect, it, vi } from 'vite-plus/test';
import {
  forgetDeletedInstanceQueries,
  invalidateInstanceQueries,
  invalidateInstancesListQueries,
} from '@/domains/customer-management';

const invalidateCustomerQueriesSpy = vi.fn();
const getInstanceQueryKeySpy = vi.fn(({ path: { instanceSlug } }) => [
  'instance',
  instanceSlug,
]);
const getInstancesQueryKeySpy = vi.fn(() => ['instances']);

vi.mock('@/api-client/@tanstack/react-query.gen', () => ({
  getInstanceQueryKey: (options: { path: { instanceSlug: string } }) =>
    getInstanceQueryKeySpy(options),
  getInstancesQueryKey: () => getInstancesQueryKeySpy(),
}));

vi.mock(
  '@/domains/customer-management/queries/customer-query-invalidation',
  () => ({
    invalidateCustomerQueries: (queryClient: unknown) =>
      invalidateCustomerQueriesSpy(queryClient),
  }),
);

vi.mock(
  '@/domains/customer-management/queries/use-instances-with-relations',
  () => ({
    instancesWithRelationsBaseQueryKey: ['instances', 'with-relations'],
  }),
);

describe('instance-query-invalidation', () => {
  it('invalidates instance list queries and customer projections together', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };

    await invalidateInstancesListQueries(queryClient as never);

    expect(invalidateCustomerQueriesSpy).toHaveBeenCalledWith(queryClient);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['instances'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['instances', 'with-relations'],
    });
  });

  it('also invalidates the instance detail query for a specific instance', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };

    await invalidateInstanceQueries(queryClient as never, 'instance-a');

    expect(getInstanceQueryKeySpy).toHaveBeenCalledWith({
      path: { instanceSlug: 'instance-a' },
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['instance', 'instance-a'],
    });
  });

  it('drops the detail query of a deleted instance instead of revalidating it', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      removeQueries: vi.fn(),
    };

    await forgetDeletedInstanceQueries(queryClient as never, 'instance-a');

    expect(queryClient.removeQueries).toHaveBeenCalledWith({
      queryKey: ['instance', 'instance-a'],
    });
    // A hard-deleted row has nothing to refetch: revalidating it is what leaves
    // a mounted detail route retrying a 404.
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['instance', 'instance-a'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['instances'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['instances', 'with-relations'],
    });
  });
});
