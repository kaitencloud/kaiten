import {
  type ListAddonsResponse,
  type ListPublishableKeysData,
  type ListPublishableKeysResponse,
  type ListVoucherRedemptionsResponse,
  type ListVouchersResponse,
  listAddons,
  listPublishableKeys,
  listVoucherRedemptions,
  listVouchers,
} from '@/api-client';
import {
  listAddonsOptions,
  listPublishableKeysOptions,
  listVoucherRedemptionsOptions,
  listVouchersOptions,
} from '@/api-client/@tanstack/react-query.gen';
import { pageRequest, type QueryContext } from './all-pages-query-options';
import { fetchAllPages } from './pagination';

// The lists of billing that the API pages: the versions of the add-ons, the vouchers,
// the redemptions of a voucher and the publishable keys. They are read as the lists of
// `all-pages-query-options.ts` are, under the generated key of the first-page options
// and across every page, so that a screen that searches and sorts in the browser holds
// the whole list and not its first fifty rows.

/**
 * What narrows the list of publishable keys: whether the revoked ones are in it. The
 * cursor and the page size are the walk's.
 */
export type PublishableKeysQuery = Omit<
  NonNullable<ListPublishableKeysData['query']>,
  'cursor' | 'limit'
>;

export const allAddonsOptions = () => ({
  ...listAddonsOptions(),
  queryFn: async ({ signal }: QueryContext): Promise<ListAddonsResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) => (await listAddons(pageRequest(cursor, signal))).data,
      signal,
    ),
  }),
});

export const allPublishableKeysOptions = (query: PublishableKeysQuery = {}) => {
  // The list without the revoked keys has the operation's own key, with no query in
  // it, so that `listPublishableKeysQueryKey()` reaches both lists.
  const narrowed = Object.keys(query).length > 0;

  return {
    ...listPublishableKeysOptions(narrowed ? { query } : undefined),
    queryFn: async ({
      signal,
    }: QueryContext): Promise<ListPublishableKeysResponse> => ({
      hasMore: false,
      items: await fetchAllPages(
        async (cursor) =>
          (await listPublishableKeys(pageRequest(cursor, signal, query))).data,
        signal,
      ),
    }),
  };
};

export const allVoucherRedemptionsOptions = (voucherId: string) => ({
  ...listVoucherRedemptionsOptions({ path: { voucherId } }),
  queryFn: async ({
    signal,
  }: QueryContext): Promise<ListVoucherRedemptionsResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) =>
        (
          await listVoucherRedemptions({
            ...pageRequest(cursor, signal),
            path: { voucherId },
          })
        ).data,
      signal,
    ),
  }),
});

export const allVouchersOptions = () => ({
  ...listVouchersOptions(),
  queryFn: async ({ signal }: QueryContext): Promise<ListVouchersResponse> => ({
    hasMore: false,
    items: await fetchAllPages(
      async (cursor) => (await listVouchers(pageRequest(cursor, signal))).data,
      signal,
    ),
  }),
});
