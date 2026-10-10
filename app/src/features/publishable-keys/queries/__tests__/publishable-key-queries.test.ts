import { QueryClient } from '@tanstack/react-query';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleListPublishableKeys } from '@/api-client/msw.gen';
import '@/lib/api/bootstrap';
import { buildPublishableKey } from '../../../../../e2e/app/_support/fixtures';
import {
  ensurePublishableKey,
  invalidatePublishableKeyQueries,
  publishableKeysQueryOptions,
} from '..';

const LIVE = buildPublishableKey({ id: 'pk-live', label: 'live' });
const REVOKED = buildPublishableKey({
  id: 'pk-revoked',
  label: 'revoked',
  revokedAt: '2026-08-15T12:00:00Z',
});

const serve = () => {
  const queries: Array<string | null> = [];
  server.use(
    handleListPublishableKeys(({ request }) => {
      const includeRevoked = new URL(request.url).searchParams.get(
        'includeRevoked',
      );
      queries.push(includeRevoked);

      return HttpResponse.json({
        hasMore: false,
        items: includeRevoked === 'true' ? [LIVE, REVOKED] : [LIVE],
      });
    }),
  );

  return queries;
};

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('publishableKeysQueryOptions', () => {
  it('reads the list as a page, without the revoked keys unless they are asked for', async () => {
    const queries = serve();
    const client = newClient();

    const live = await client.fetchQuery(publishableKeysQueryOptions());
    const all = await client.fetchQuery(publishableKeysQueryOptions(true));

    expect(live).toEqual({ hasMore: false, items: [LIVE] });
    expect(all.items).toEqual([LIVE, REVOKED]);
    expect(queries).toEqual([null, 'true']);
  });

  it('keeps the two reads apart in the cache', () => {
    expect(publishableKeysQueryOptions().queryKey).not.toEqual(
      publishableKeysQueryOptions(true).queryKey,
    );
  });
});

describe('ensurePublishableKey', () => {
  it('finds a key in a list the cache holds, asking the API for nothing', async () => {
    const queries = serve();
    const client = newClient();
    await client.fetchQuery(publishableKeysQueryOptions());
    queries.length = 0;

    expect(await ensurePublishableKey(client, 'pk-live')).toEqual(LIVE);
    expect(queries).toEqual([]);
  });

  it('reads the list with the revoked keys when the cache has none, and finds a revoked key there', async () => {
    const queries = serve();

    expect(await ensurePublishableKey(newClient(), 'pk-revoked')).toEqual(
      REVOKED,
    );
    expect(queries).toEqual(['true']);
  });

  it('answers nothing for a key the API does not list', async () => {
    serve();

    expect(await ensurePublishableKey(newClient(), 'ghost')).toBeUndefined();
  });
});

describe('invalidatePublishableKeyQueries', () => {
  it('marks both reads of the list as stale', async () => {
    serve();
    const client = newClient();
    await client.fetchQuery(publishableKeysQueryOptions());
    await client.fetchQuery(publishableKeysQueryOptions(true));

    await invalidatePublishableKeyQueries(client);

    for (const includeRevoked of [false, true]) {
      expect(
        client.getQueryState(
          publishableKeysQueryOptions(includeRevoked).queryKey,
        )?.isInvalidated,
      ).toBe(true);
    }
  });
});
