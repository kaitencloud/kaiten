import { QueryClient } from '@tanstack/react-query';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleListEntitlementResources } from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`.
import '@/lib/api/bootstrap';
import {
  ENTITLEMENT_RESOURCES_PAGE_SIZE,
  entitlementResourcesQueryOptions,
} from '../entitlement-resources-query-options';

const resource = (resourceKey: string) => ({
  resourceKey,
  value: { event_count: 1, type: 'number' as const, value: 1 },
});

describe('the pages of the resources of an entitlement', () => {
  it('reads by cursor: none for the first page, the one the API gave for each next, fifty at a time', async () => {
    const asked: Array<{ params: Record<string, unknown>; url: URL }> = [];
    server.use(
      handleListEntitlementResources(({ params, request }) => {
        const url = new URL(request.url);
        asked.push({ params, url });

        return HttpResponse.json(
          url.searchParams.get('cursor') === 'after-b'
            ? { hasMore: false, items: [resource('c')] }
            : {
                hasMore: true,
                items: [resource('a'), resource('b')],
                nextCursor: 'after-b',
              },
        );
      }),
    );

    const read = await new QueryClient().fetchInfiniteQuery({
      ...entitlementResourcesQueryOptions(
        'nagare-production',
        'sources-per-competitor',
      ),
      pages: 2,
    });

    expect(
      read.pages.flatMap((page) => page.items.map((item) => item.resourceKey)),
    ).toEqual(['a', 'b', 'c']);
    expect(asked).toHaveLength(2);
    expect(asked[0].params).toMatchObject({
      entitlementSlug: 'sources-per-competitor',
      instanceSlug: 'nagare-production',
    });
    expect(asked[0].url.searchParams.has('cursor')).toBe(false);
    expect(asked[0].url.searchParams.get('limit')).toBe(
      String(ENTITLEMENT_RESOURCES_PAGE_SIZE),
    );
    expect(asked[1].url.searchParams.get('cursor')).toBe('after-b');
    expect(asked[1].url.searchParams.get('limit')).toBe('50');
  });

  it('stops where the API says there is no more, even when it gave a cursor', async () => {
    server.use(
      handleListEntitlementResources(() =>
        HttpResponse.json({
          hasMore: false,
          items: [resource('a')],
          nextCursor: 'ignored',
        }),
      ),
    );
    const options = entitlementResourcesQueryOptions('i', 'e');

    expect(
      options.getNextPageParam(
        { hasMore: false, items: [], nextCursor: 'ignored' },
        [],
        undefined,
        [],
      ),
    ).toBeUndefined();
    expect(
      options.getNextPageParam(
        { hasMore: true, items: [], nextCursor: 'c1' },
        [],
        undefined,
        [],
      ),
    ).toBe('c1');
  });

  it('keeps one cache for each pair, marked as a paged read so that an invalidation of the operation reaches it', () => {
    const key = (instance: string, entitlement: string) =>
      JSON.stringify(entitlementResourcesQueryOptions(instance, entitlement).queryKey);

    expect(key('nagare-production', 'sources')).not.toBe(key('nagare-staging', 'sources'));
    expect(key('nagare-production', 'sources')).not.toBe(key('nagare-production', 'pages'));
    expect(key('nagare-production', 'sources')).toContain('"_infinite":true');
    expect(key('nagare-production', 'sources')).toContain('listEntitlementResources');
  });

  it('does not retry a refusal: it is the answer the drawer shows', () => {
    const options = entitlementResourcesQueryOptions('i', 'e');

    expect(options.retry).toBe(false);
    expect(options.retryOnMount).toBe(false);
  });
});
