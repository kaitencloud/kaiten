import { queryOptions } from '@tanstack/react-query';
import { listInstanceVouchers } from '@/api-client';
import { listInstanceVouchersQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { toListPage } from '@/lib/api/pagination';

// The voucher API answers plain arrays where the rest of the console reads lists
// (`{ items, hasMore }`): the read goes through `toListPage`, the one place that turns an
// array into a list, so that the day the API pages it, only this read changes. It keeps
// the generated key, so that the invalidation of the vouchers and of an instance reaches
// it. Not retried: a refusal of billing is the card's to show, with a way to ask again.

/**
 * What an instance redeemed, newest first, with the state of each: what its Billing tab
 * lists and what takes a redemption back.
 */
export const instanceVouchersQueryOptions = (instanceSlug: string) =>
  queryOptions({
    queryFn: async ({ signal }) =>
      toListPage(
        (
          await listInstanceVouchers({
            path: { instanceSlug },
            signal,
            throwOnError: true,
          })
        ).data,
      ),
    queryKey: listInstanceVouchersQueryKey({ path: { instanceSlug } }),
    retry: false,
    retryOnMount: false,
  });
