import { QueryClient } from '@tanstack/react-query';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import {
  getAddonQueryKey,
  listAddonCompatibilityQueryKey,
  listAddonEntitlementsQueryKey,
  listAddonFamiliesQueryKey,
  listAddonPricesQueryKey,
  listAddonsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { handleListAddonFamilies } from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`.
import '@/lib/api/bootstrap';
import { buildAddon } from '../../../../../e2e/app/_support/fixtures';
import { addonFamiliesQueryOptions } from '../addon-query-options';
import {
  invalidateAddonCompatibilityQueries,
  invalidateAddonDetails,
  invalidateAddonGrantQueries,
  invalidateAddonPriceQueries,
  invalidateAddonQueries,
} from '../addon-query-invalidation';

const SEATS = buildAddon({ familySlug: 'extra-seats', name: 'Extra seats', slug: 'extra-seats' });

describe('the families of add-ons', () => {
  it('are read in the shape of the other lists, whatever the API answers them in', async () => {
    server.use(
      handleListAddonFamilies({
        body: [
          { currentVersion: SEATS, id: 'family', isPublic: false, lastVersion: 1, slug: 'extra-seats', versions: [SEATS] },
        ],
      }),
    );

    const page = await new QueryClient().fetchQuery(addonFamiliesQueryOptions);

    expect(page.hasMore).toBe(false);
    expect(page.items.map(({ slug }) => slug)).toEqual(['extra-seats']);
  });

  it('are an empty list when the API answers nothing', async () => {
    server.use(handleListAddonFamilies(() => HttpResponse.json(null)));

    expect(await new QueryClient().fetchQuery(addonFamiliesQueryOptions)).toEqual({
      hasMore: false,
      items: [],
    });
  });

  it('keep the key of the operation, so that every invalidation aimed at it lands', () => {
    expect(addonFamiliesQueryOptions.queryKey).toEqual(listAddonFamiliesQueryKey());
  });
});

describe('what a change to the catalogue refreshes', () => {
  /** A client holding one read of everything, each marked to be told apart when it is stale. */
  function seeded() {
    const queryClient = new QueryClient();
    const keys = {
      compatibility: listAddonCompatibilityQueryKey({ path: { addonSlug: 'extra-seats' } }),
      detail: getAddonQueryKey({ path: { addonSlug: 'extra-seats' } }),
      detailOfAnother: getAddonQueryKey({ path: { addonSlug: 'extra-storage' } }),
      families: listAddonFamiliesQueryKey(),
      grants: listAddonEntitlementsQueryKey({ path: { addonSlug: 'extra-seats' } }),
      prices: listAddonPricesQueryKey({ path: { addonSlug: 'extra-seats' } }),
      versions: listAddonsQueryKey(),
    };
    for (const key of Object.values(keys)) {
      queryClient.setQueryData(key, []);
    }
    const stale = (key: readonly unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated ?? false;

    return { keys, queryClient, stale };
  }

  it('is, for a version, the families and the versions they hold, and its own detail when it is named', async () => {
    const { keys, queryClient, stale } = seeded();

    await invalidateAddonQueries(queryClient, 'extra-seats');

    expect(stale(keys.families)).toBe(true);
    expect(stale(keys.versions)).toBe(true);
    expect(stale(keys.detail)).toBe(true);
    expect(stale(keys.detailOfAnother)).toBe(false);
    expect(stale(keys.grants)).toBe(false);
  });

  it('is only the lists when no version is named', async () => {
    const { keys, queryClient, stale } = seeded();

    await invalidateAddonQueries(queryClient);

    expect(stale(keys.families)).toBe(true);
    expect(stale(keys.detail)).toBe(false);
  });

  it('is every detail when the default moves, since only the server knows which version lost the flag', async () => {
    const { keys, queryClient, stale } = seeded();

    await invalidateAddonDetails(queryClient);

    expect(stale(keys.detail)).toBe(true);
    expect(stale(keys.detailOfAnother)).toBe(true);
    expect(stale(keys.families)).toBe(false);
  });

  it('is, for a grant, the grants of that version and nothing else', async () => {
    const { keys, queryClient, stale } = seeded();

    await invalidateAddonGrantQueries(queryClient, 'extra-seats');

    expect(stale(keys.grants)).toBe(true);
    expect(stale(keys.prices)).toBe(false);
    expect(stale(keys.families)).toBe(false);
  });

  it('is, for a price, the prices of that version', async () => {
    const { keys, queryClient, stale } = seeded();

    await invalidateAddonPriceQueries(queryClient, 'extra-seats');

    expect(stale(keys.prices)).toBe(true);
    expect(stale(keys.grants)).toBe(false);
  });

  it('is, for the license families a version fits, that declaration', async () => {
    const { keys, queryClient, stale } = seeded();

    await invalidateAddonCompatibilityQueries(queryClient, 'extra-seats');

    expect(stale(keys.compatibility)).toBe(true);
    expect(stale(keys.grants)).toBe(false);
  });
});
