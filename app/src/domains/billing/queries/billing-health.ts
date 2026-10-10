import { queryOptions } from '@tanstack/react-query';
import { getBillingHealthOptions } from '@/api-client/@tanstack/react-query.gen';

/**
 * `GET /billing/health`: what needs a person's attention in billing (held and
 * overdue invoices, pushes that keep failing, what waits for the accounting system,
 * invoices whose provider disagrees, periods that did not close) and how the payment
 * provider's last pass went. It keeps the generated key, so that an action on an
 * invoice, and a pass of the provider, refresh it (`invalidateInvoiceQueries`).
 *
 * A read of billing is not retried: a refusal is shown, with a way to ask again.
 */
export const billingHealthQueryOptions = queryOptions({
  ...getBillingHealthOptions(),
  retry: false,
  retryOnMount: false,
});
