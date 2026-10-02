import { HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Entitlement } from '@/api-client';
import { listEntitlementsOptions } from '@/api-client/@tanstack/react-query.gen';
import { handleListEntitlements } from '@/api-client/msw.gen';
import { allEntitlementsOptions } from '../all-pages-query-options';

const entitlement = (id: string) => ({ id }) as Entitlement;

describe('allEntitlementsOptions', () => {
  it('reads every page under the generated first-page query key', async () => {
    const pageQueries: Array<Record<string, string>> = [];
    server.use(
      handleListEntitlements(({ request }) => {
        const query = Object.fromEntries(new URL(request.url).searchParams);
        pageQueries.push(query);

        return HttpResponse.json(
          query.cursor === 'c1'
            ? { hasMore: false, items: [entitlement('e2')] }
            : { hasMore: true, items: [entitlement('e1')], nextCursor: 'c1' },
        );
      }),
    );

    const options = allEntitlementsOptions();

    // Invalidations and cache updates target the generated key.
    expect(options.queryKey).toEqual(listEntitlementsOptions().queryKey);

    const result = await options.queryFn?.({
      signal: new AbortController().signal,
    } as never);

    expect(result).toEqual({
      hasMore: false,
      items: [entitlement('e1'), entitlement('e2')],
    });
    expect(pageQueries).toEqual([
      { limit: '200' },
      { cursor: 'c1', limit: '200' },
    ]);
  });
});
