import { useMutation } from '@tanstack/react-query';
import { lookupVoucherMutation } from '@/api-client/@tanstack/react-query.gen';

/**
 * Finds the voucher a code names. The code travels in the body of a POST, never in a
 * URL, a query key or the storage of the browser, and the answer is only used to go to
 * the voucher by its id: this is a mutation and not a query, which is what keeps the
 * code out of the key of a cache.
 */
export function useVoucherLookup() {
  return useMutation(lookupVoucherMutation());
}
