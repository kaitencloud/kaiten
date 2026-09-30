import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  forgetDeletedCustomerQueries,
  invalidateCustomerQueries,
} from './customer-query-invalidation';

const getCustomerQueryKeySpy = vi.fn(({ path: { customerSlug } }) => [
  'customer',
  customerSlug,
]);
const listCustomersQueryKeySpy = vi.fn(() => ['customers']);

vi.mock('@/api-client/@tanstack/react-query.gen', () => ({
  getCustomerQueryKey: (options: { path: { customerSlug: string } }) =>
    getCustomerQueryKeySpy(options),
  listCustomersQueryKey: () => listCustomersQueryKeySpy(),
}));

vi.mock('./use-customers-with-instances', () => ({
  customersWithInstancesQueryOptions: {
    queryKey: ['customers', 'with-instances'],
  },
}));

describe('customer-query-invalidation', () => {
  beforeEach(() => {
    getCustomerQueryKeySpy.mockClear();
    listCustomersQueryKeySpy.mockClear();
  });

  it('invalidates the customer list projections when no slug is given', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };

    await invalidateCustomerQueries(queryClient as never);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['customers'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['customers', 'with-instances'],
    });
    expect(getCustomerQueryKeySpy).not.toHaveBeenCalled();
  });

  it('also invalidates the customer detail query for a specific customer', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };

    await invalidateCustomerQueries(queryClient as never, 'acme');

    expect(getCustomerQueryKeySpy).toHaveBeenCalledWith({
      path: { customerSlug: 'acme' },
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['customer', 'acme'],
    });
  });

  it('drops the detail query of a deleted customer instead of revalidating it', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      removeQueries: vi.fn(),
    };

    await forgetDeletedCustomerQueries(queryClient as never, 'acme');

    expect(queryClient.removeQueries).toHaveBeenCalledWith({
      queryKey: ['customer', 'acme'],
    });
    // A hard-deleted row has nothing to refetch: revalidating it is what leaves
    // a mounted detail route retrying a dead request before it can navigate.
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['customer', 'acme'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['customers'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['customers', 'with-instances'],
    });
  });
});
