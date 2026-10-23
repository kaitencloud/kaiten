import { getCheckoutSessionAdminOptions } from '@/api-client/@tanstack/react-query.gen';
import { allCheckoutSessionsOptions } from '@/lib/api/all-billing-pages-query-options';

/**
 * The anonymous checkouts of the organization, newest first, whatever their status. The
 * API pages the list (fifty a page unless asked for more): the read walks every page, so
 * that the screen holds the whole list and filters it in the browser. It is not retried:
 * a refusal of billing is the screen's to show, with a way to ask again, and one that the
 * route's loader met is the answer.
 */
export const checkoutSessionsQueryOptions = () => ({
  ...allCheckoutSessionsOptions(),
  retry: false,
  retryOnMount: false,
});

/**
 * One checkout by its id, for the panel that shows it. The API deletes a checkout 90
 * days after it closed, and then answers 404, which is final: it is not retried.
 */
export const checkoutSessionQueryOptions = (sessionId: string) => ({
  ...getCheckoutSessionAdminOptions({ path: { sessionId } }),
  retry: false,
});
