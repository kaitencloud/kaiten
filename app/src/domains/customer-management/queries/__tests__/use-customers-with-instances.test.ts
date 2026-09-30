import { describe, expect, it, vi } from 'vite-plus/test';
import { customersWithInstancesQueryOptions } from '../use-customers-with-instances';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock('@/lib/graphql-client', () => ({
  graphqlClient: { request: requestMock },
}));

const customer = (slug: string) => ({
  createdAt: '2026-09-10T00:00:00Z',
  domain: null,
  externalCustomerId: null,
  instances: [{ description: null, license: { type: 'COMMUNITY' }, name: `${slug} prod`, slug: `${slug}-prod` }],
  integrations: null,
  name: slug,
  slug,
  updatedAt: '2026-09-10T00:00:00Z',
});

describe('customersWithInstancesQueryOptions', () => {
  it('reads every page of customers, not just the first 50', async () => {
    requestMock
      .mockResolvedValueOnce({
        customers: { hasMore: true, items: [customer('acme')], nextCursor: 'c1' },
      })
      .mockResolvedValueOnce({
        customers: { hasMore: false, items: [customer('globex')], nextCursor: null },
      });

    const rows = await customersWithInstancesQueryOptions.queryFn?.({} as never);

    expect(rows?.map((row) => row.slug)).toEqual(['acme', 'globex']);
    expect(rows?.[0]).toMatchObject({ licenseTypes: ['COMMUNITY'], nbInstances: 1 });
    expect(requestMock).toHaveBeenNthCalledWith(1, expect.any(String), {
      cursor: undefined,
      limit: 200,
    });
    expect(requestMock).toHaveBeenNthCalledWith(2, expect.any(String), {
      cursor: 'c1',
      limit: 200,
    });
  });
});
