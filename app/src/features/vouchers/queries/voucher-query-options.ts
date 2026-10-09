import { queryOptions } from '@tanstack/react-query';
import { listVoucherRedemptions, listVouchers } from '@/api-client';
import {
  getVoucherOptions,
  listVoucherRedemptionsQueryKey,
  listVouchersQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { toListPage } from '@/lib/api/pagination';

// The voucher API answers plain arrays where the rest of the console reads lists
// (`{ items, hasMore }`). Every read of one in this feature goes through here, and
// `toListPage` is the one place that turns an array into a list, so that the day the
// API pages them, only these reads change. They keep the generated keys, so that the
// invalidation of the vouchers reaches them.
//
// None is retried: a refusal of billing is the screen's to show, with a way to ask
// again, and one that the route's loader met is the answer.

/**
 * Every voucher of the organization, newest first, with its code: what the list page
 * searches and filters in the browser. The code is in the answer, never in the key.
 */
export const vouchersQueryOptions = queryOptions({
  queryFn: async ({ signal }) =>
    toListPage((await listVouchers({ signal, throwOnError: true })).data),
  queryKey: listVouchersQueryKey(),
  retry: false,
  retryOnMount: false,
});

/** One voucher by its id, with its code: routes address a voucher by id, never by code. */
export const voucherQueryOptions = (voucherId: string) => ({
  ...getVoucherOptions({ path: { voucherId } }),
  retry: false,
  retryOnMount: false,
});

/** What was redeemed of a voucher, newest first. */
export const voucherRedemptionsQueryOptions = (voucherId: string) =>
  queryOptions({
    queryFn: async ({ signal }) =>
      toListPage(
        (
          await listVoucherRedemptions({
            path: { voucherId },
            signal,
            throwOnError: true,
          })
        ).data,
      ),
    queryKey: listVoucherRedemptionsQueryKey({ path: { voucherId } }),
    retry: false,
    retryOnMount: false,
  });
