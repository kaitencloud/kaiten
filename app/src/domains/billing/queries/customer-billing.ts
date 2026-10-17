import { queryOptions } from '@tanstack/react-query';
import { getCustomerBillingOptions } from '@/api-client/@tanstack/react-query.gen';

/**
 * `GET /customers/{customerSlug}/billing`: what a customer has in the payment
 * providers: the address its invoices are sent to, and, for each provider, the
 * customer there and the payment method it holds. It keeps the generated key, so that
 * `invalidateCustomerBillingQueries` refreshes it after a payment method changes.
 *
 * A read of billing is not retried: a refusal is shown, with a way to ask again.
 */
export const customerBillingQueryOptions = (customerSlug: string) =>
  queryOptions({
    ...getCustomerBillingOptions({ path: { customerSlug } }),
    retry: false,
    retryOnMount: false,
  });
