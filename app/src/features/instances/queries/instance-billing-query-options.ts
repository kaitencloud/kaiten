import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
  getInstanceBilling,
  getUpcomingInvoice,
  listInstanceInvoices,
  listLicensePrices,
} from '@/api-client';
import {
  getInstanceBillingQueryKey,
  getUpcomingInvoiceQueryKey,
  listInstanceInvoicesInfiniteQueryKey,
  listLicensePricesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { getProblemCode, INVOICES_PAGE_SIZE } from '@/domains/billing';

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
 * subscribed, newest first, a page at a time. It keeps the key the generated
 * options give the operation (an infinite one), so that the invalidation of an
 * invoice or of the subscription reaches it.
 */
export const instanceInvoicesQueryOptions = (instanceSlug: string) => {
  const path = { instanceSlug };
  const query = { limit: INVOICES_PAGE_SIZE };

  return infiniteQueryOptions({
    queryKey: listInstanceInvoicesInfiniteQueryKey({ path, query }),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await listInstanceInvoices({
        path,
        query: { ...query, cursor: pageParam },
        signal,
        throwOnError: true,
      });

      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    retry: false,
    retryOnMount: false,
  });
};

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
