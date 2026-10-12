import { getVoucherOptions } from '@/api-client/@tanstack/react-query.gen';
import {
  allVoucherRedemptionsOptions,
  allVouchersOptions,
} from '@/lib/api/all-billing-pages-query-options';

// The voucher API pages its lists (fifty rows a page unless asked for more), and the
// screens of this feature search and sort in the browser, so each read here walks every
// page (`allVouchersOptions`, `allVoucherRedemptionsOptions`). They keep the generated
// keys, so that the invalidation of the vouchers reaches them.
//
// None is retried: a refusal of billing is the screen's to show, with a way to ask
// again, and one that the route's loader met is the answer.

/**
 * Every voucher of the organization, newest first, with its code: what the list page
 * searches and filters in the browser. The code is in the answer, never in the key.
 */
export const vouchersQueryOptions = {
  ...allVouchersOptions(),
  retry: false,
  retryOnMount: false,
};

/** One voucher by its id, with its code: routes address a voucher by id, never by code. */
export const voucherQueryOptions = (voucherId: string) => ({
  ...getVoucherOptions({ path: { voucherId } }),
  retry: false,
  retryOnMount: false,
});

/** What was redeemed of a voucher, newest first. */
export const voucherRedemptionsQueryOptions = (voucherId: string) => ({
  ...allVoucherRedemptionsOptions(voucherId),
  retry: false,
  retryOnMount: false,
});
