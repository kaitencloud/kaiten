import { describe, expect, it } from 'vite-plus/test';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import { sessionToken } from '@/test-fixtures/billing-test-support';
import { graphqlPage } from '../../e2e/app/_support/model/graphql-operations';
import { server } from './msw-server';

// What the mocks answer to the documents of billing that the lists read over GraphQL,
// and how they refuse a whole document to a session that lacks a scope, as the API does.

const graphql = async (
  operationName: string,
  variables: Record<string, unknown> = {},
  scopes?: string[],
) => {
  const response = await fetch('http://api.test/api/graphql', {
    body: JSON.stringify({
      query: `query ${operationName} { _health }`,
      variables,
    }),
    headers: {
      'Content-Type': 'application/json',
      ...(scopes ? { Authorization: `Bearer ${sessionToken(scopes)}` } : {}),
    },
    method: 'POST',
  });

  return { body: await response.json(), status: response.status };
};

const useDevWorld = () => {
  const config = createDevMockConfig();
  server.use(
    ...createMockHandlers(config, 'off', undefined, true),
    undeclaredApiRequest,
  );

  return config;
};

describe('graphqlPage', () => {
  const rows = Array.from({ length: 5 }, (_, index) => index);

  it('serves the limit asked for after the row the cursor names, and the cursor of the next page', () => {
    expect(graphqlPage(rows, { limit: 2 })).toEqual({
      hasMore: true,
      items: [0, 1],
      nextCursor: '2',
    });
    expect(graphqlPage(rows, { cursor: '2', limit: 2 })).toEqual({
      hasMore: true,
      items: [2, 3],
      nextCursor: '4',
    });
    expect(graphqlPage(rows, { cursor: '4', limit: 2 })).toEqual({
      hasMore: false,
      items: [4],
      nextCursor: null,
    });
  });

  it('serves fifty rows when no limit is asked for, and never more than two hundred', () => {
    const many = Array.from({ length: 300 }, (_, index) => index);

    expect(graphqlPage(many, {}).items).toHaveLength(50);
    expect(graphqlPage(many, { limit: 5000 }).items).toHaveLength(200);
    expect(graphqlPage(many, { limit: 0 }).items).toHaveLength(50);
  });
});

describe('GetInstancesBilling', () => {
  it('answers the subscription of every instance of the dev world, and null for one nobody subscribed', async () => {
    useDevWorld();

    const { body, status } = await graphql('GetInstancesBilling', {
      limit: 200,
    });
    const billing = Object.fromEntries(
      body.data.instances.items.map(
        (item: { billing: { status: string } | null; slug: string }) => [
          item.slug,
          item.billing?.status ?? null,
        ],
      ),
    );

    expect(status).toBe(200);
    expect(body.data.instances.hasMore).toBe(false);
    expect(billing).toMatchObject({
      'acme-legacy': 'CANCELED',
      'acme-production': 'ACTIVE',
      'beta-staging': 'TRIAL',
      'globex-production': 'PAST_DUE',
    });
    // A world instance that was never subscribed is still on the page, with null.
    expect(Object.values(billing)).toContain(null);
  });

  it('answers a page at a time, as the API pages a list', async () => {
    useDevWorld();

    const first = await graphql('GetInstancesBilling', { limit: 2 });
    const second = await graphql('GetInstancesBilling', {
      cursor: first.body.data.instances.nextCursor,
      limit: 2,
    });

    expect(first.body.data.instances.items).toHaveLength(2);
    expect(first.body.data.instances.hasMore).toBe(true);
    expect(second.body.data.instances.items).toHaveLength(2);
    expect(second.body.data.instances.items[0].slug).not.toBe(
      first.body.data.instances.items[0].slug,
    );
  });
});

describe('a document the session lacks a scope for', () => {
  it('is refused whole, with the problem the API answers, naming the first scope missing', async () => {
    useDevWorld();

    const { body, status } = await graphql('GetInstancesBilling', { limit: 200 }, [
      'read:instances',
      'read:customers',
      'read:licenses',
    ]);

    expect(status).toBe(403);
    expect(body).toMatchObject({
      code: 'Auth.MissingScope',
      detail: 'missing required scope: read:billing',
    });
    expect(body.data).toBeUndefined();
  });

  it('names the scopes in the order the document needs them: the instances before billing', async () => {
    useDevWorld();

    const { body, status } = await graphql('GetInstancesBilling', {}, [
      'read:billing',
    ]);

    expect(status).toBe(403);
    expect(body.detail).toBe('missing required scope: read:instances');
  });

  it('is refused for the licenses to a session that cannot read them', async () => {
    useDevWorld();

    const { body, status } = await graphql('GetLicensesWithPrices', {}, [
      'read:billing',
    ]);

    expect(status).toBe(403);
    expect(body.detail).toBe('missing required scope: read:licenses');
  });

  it('leaves the documents of the other screens to the screens: they are served whatever the token lists', async () => {
    useDevWorld();

    expect(
      (await graphql('GetInstancesWithRelations', {}, ['read:billing'])).status,
    ).toBe(200);
  });

  it('is served to a session that holds every scope, a wildcard included', async () => {
    useDevWorld();

    expect((await graphql('GetInstancesBilling', {}, ['read:*'])).status).toBe(200);
    expect(
      (
        await graphql('GetInstancesBilling', {}, [
          'read:instances',
          'write:billing',
        ])
      ).status,
    ).toBe(200);
  });

  it('is served to a token that says nothing of its scopes, as the console serves it', async () => {
    useDevWorld();

    expect((await graphql('GetInstancesBilling', {})).status).toBe(200);
  });
});
