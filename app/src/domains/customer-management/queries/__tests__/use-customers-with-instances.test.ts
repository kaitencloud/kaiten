import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import { customersWithInstancesQueryOptions } from '../use-customers-with-instances';

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
    const pageVariables: unknown[] = [];
    server.use(
      graphqlOperationHandler({
        GetCustomersWithInstances: (variables) => {
          pageVariables.push(variables);
          return variables?.cursor === 'c1'
            ? { customers: { hasMore: false, items: [customer('globex')], nextCursor: null } }
            : { customers: { hasMore: true, items: [customer('acme')], nextCursor: 'c1' } };
        },
      }),
    );

    const rows = await customersWithInstancesQueryOptions.queryFn?.({} as never);

    expect(rows?.map((row) => row.slug)).toEqual(['acme', 'globex']);
    expect(rows?.[0]).toMatchObject({ licenseTypes: ['COMMUNITY'], nbInstances: 1 });
    // The first page sends no cursor at all: undefined does not survive JSON.
    expect(pageVariables).toEqual([{ limit: 200 }, { cursor: 'c1', limit: 200 }]);
  });
});
