import { queryOptions } from '@tanstack/react-query';
import {
  getInstanceBilling,
  getUpcomingInvoice,
  listLicensePrices,
} from '@/api-client';
import {
  getInstanceBillingQueryKey,
  getUpcomingInvoiceQueryKey,
  listLicensePricesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { getProblemCode } from '@/domains/billing';
import { allInstanceInvoicesOptions } from '@/lib/api/all-pages-query-options';

const NOT_SUBSCRIBED = 'GetInstanceBilling.NotFound';
const UPCOMING_NOT_FOUND = 'GetUpcomingInvoice.NotFound';
const UPCOMING_NOT_ACTIVE = 'GetUpcomingInvoice.NotActive';

/**
 * The subscription of an instance, or `null` when it was never subscribed: the
 * API answers that with a 404 that is the empty state of the tab, not a failure
 * (`GetInstanceBilling.NotFound`), so it is read as an answer and never retried.
 * A subscription that ended is returned like any other, as CANCELED. It keeps the
 * generated key, so that every mutation of the subscription refreshes it.
 *
 * Any other refusal is thrown, for the tab to show with a way to ask again.
 */
export const instanceBillingQueryOptions = (instanceSlug: string) =>
  queryOptions({
    queryKey: getInstanceBillingQueryKey({ path: { instanceSlug } }),
    queryFn: async ({ signal }) => {
      try {
        const { data } = await getInstanceBilling({
          path: { instanceSlug },
          signal,
          throwOnError: true,
        });

        return data;
      } catch (error) {
        if (getProblemCode(error) === NOT_SUBSCRIBED) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
    // A refusal the route's loader met is the answer: the tab shows it, with a way
    // to ask again, instead of asking once more by itself behind it.
    retryOnMount: false,
  });

/**
 * The invoice the next boundary of a subscription will issue, composed from its
 * usage so far. Nothing is written. A subscription that was never one, or that
 * ended, has no upcoming invoice, and that is told as `null` (404
 * `GetUpcomingInvoice.NotFound`, 409 `GetUpcomingInvoice.NotActive`): the tab does
 * not ask in those cases, so a race with a cancellation is the only way here.
 * Usage that is no longer kept (422 `GetUpcomingInvoice.OutsideRetention`) is a
 * refusal the card shows, with where the history begins.
 */
export const upcomingInvoiceQueryOptions = (instanceSlug: string) =>
  queryOptions({
    queryKey: getUpcomingInvoiceQueryKey({ path: { instanceSlug } }),
    queryFn: async ({ signal }) => {
      try {
        const { data } = await getUpcomingInvoice({
          path: { instanceSlug },
          signal,
          throwOnError: true,
        });

        return data;
      } catch (error) {
        const code = getProblemCode(error);
        if (code === UPCOMING_NOT_FOUND || code === UPCOMING_NOT_ACTIVE) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
    retryOnMount: false,
  });

/**
 * The invoices of an instance's subscription, across every time it was
 * subscribed, every page of them: the card sorts and pages them in the browser.
 * It keeps the key the generated options give the operation, so that the
 * invalidation of an invoice or of the subscription reaches it. A read of billing
 * is not retried: a refusal is the card's to show, with a way to ask again, and one
 * the route's loader met is the answer, not read again when the card mounts.
 */
export const instanceInvoicesQueryOptions = (instanceSlug: string) => ({
  ...allInstanceInvoicesOptions(instanceSlug),
  retry: false,
  retryOnMount: false,
});

/**
 * The prices an instance can be subscribed on: the active flat fees of its
 * license version, the only ones a subscription is pinned to. Read when the
 * dialog opens, since only the dialog needs them.
 */
export const subscribablePricesQueryOptions = (licenseSlug: string) => {
  const path = { licenseSlug };
  const query = { billingModel: 'FLAT_FEE', status: 'ACTIVE' } as const;

  return queryOptions({
    queryKey: listLicensePricesQueryKey({ path, query }),
    queryFn: async ({ signal }) => {
      const { data } = await listLicensePrices({
        path,
        query,
        signal,
        throwOnError: true,
      });

      return data;
    },
    retry: false,
    retryOnMount: false,
  });
};
