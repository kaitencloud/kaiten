import { queryOptions } from '@tanstack/react-query';
import type { GetCatalogPricesQuery } from '@/api-client/graphql/graphql';
import { MAX_PAGE_SIZE, startPageWalk, takePage } from '@/lib/api/pagination';
import { graphqlClient } from '@/lib/graphql-client';
import {
  type CatalogAddonInput,
  type CatalogLicenseInput,
  toVersionsWithPrices,
  type VersionWithPrices,
} from '../logic/catalog-prices';
import { GET_CATALOG_PRICES } from './catalog-prices.queries';

export const catalogPricesBaseQueryKey = ['catalog', 'prices'] as const;

/**
 * Every license version and every add-on version of the organization with all its
 * prices, ACTIVE or DEPRECATED, in as few requests as the pages allow: the first asks
 * for a page of each list, and an organization with fewer versions than a page of
 * either (200) is read in that one request. The number of requests follows the pages
 * of the longer list and never the versions, where the REST API would take a read for
 * each version's prices.
 *
 * Each list is walked by its own cursor. A list that is read to its end is left out of
 * the next request (`withLicenses`, `withAddons`), so a long list does not read the
 * other again.
 *
 * It is a document of its own, which the price picker of a voucher asks for when it is
 * drawn, and which the mutations of a version and of a price invalidate by
 * `catalogPricesBaseQueryKey`. Not retried: a refusal is the answer, and the screen
 * that asked shows it with a way to ask again.
 */
export const catalogPricesQueryOptions = queryOptions({
  queryFn: async ({ signal }): Promise<VersionWithPrices[]> => {
    const query = GET_CATALOG_PRICES.toString();
    const licenses = startPageWalk<CatalogLicenseInput>();
    const addons = startPageWalk<CatalogAddonInput>();

    while (!licenses.done || !addons.done) {
      signal.throwIfAborted();
      const data = await graphqlClient.request<GetCatalogPricesQuery>(
        query,
        {
          addonsCursor: addons.cursor,
          limit: MAX_PAGE_SIZE,
          licensesCursor: licenses.cursor,
          withAddons: !addons.done,
          withLicenses: !licenses.done,
        },
        signal,
      );
      signal.throwIfAborted();

      if (!licenses.done) {
        takePage(licenses, data.licenses);
      }
      if (!addons.done) {
        takePage(addons, data.addons);
      }
    }

    return toVersionsWithPrices({
      addons: addons.items,
      licenses: licenses.items,
    });
  },
  queryKey: catalogPricesBaseQueryKey,
  retry: false,
  retryOnMount: false,
});
