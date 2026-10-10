import { queryOptions } from '@tanstack/react-query';
import type { GetLicensesWithPricesQuery } from '@/api-client/graphql/graphql';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/pagination';
import { graphqlClient } from '@/lib/graphql-client';
import {
  type LicenseWithPrices,
  toLicensesWithPrices,
} from '../logic/license-catalogue';
import { GET_LICENSES_WITH_PRICES } from './licenses-prices.queries';

export const licensesWithPricesBaseQueryKey = [
  'licenses',
  'with-prices',
] as const;

/**
 * Every license version of the organization with the prices it is sold at now, a
 * page of them per request. It stands where the REST API would take a read of the
 * licenses and then one read of the prices of every version, which the plans an
 * instance can move to were found with: here the prices come in the same request as
 * the versions, so the number of requests follows the pages and never the versions.
 *
 * It is a document of its own, sent only once billing is on (`useLicensesWithPrices`
 * decides). Not retried: a refusal is the answer, and the screen that asked shows it
 * with a way to ask again, or goes without.
 */
export const licensesWithPricesQueryOptions = queryOptions({
  queryFn: async ({ signal }): Promise<LicenseWithPrices[]> => {
    const query = GET_LICENSES_WITH_PRICES.toString();
    const items = await fetchAllPages(async (cursor) => {
      const data = await graphqlClient.request<GetLicensesWithPricesQuery>(
        query,
        { cursor, limit: MAX_PAGE_SIZE },
        signal,
      );

      return data.licenses;
    }, signal);

    return toLicensesWithPrices(items);
  },
  queryKey: licensesWithPricesBaseQueryKey,
  retry: false,
  retryOnMount: false,
});
