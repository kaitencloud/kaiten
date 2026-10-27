import { queryOptions } from '@tanstack/react-query';
import { getBillingSettingsOptions } from '@/api-client/@tanstack/react-query.gen';

/**
 * `GET /billing/settings`: the defaults of the organization (how an invoice is
 * collected, how long it is due, whether invoices of a payment provider also
 * enter the handoff queue). A subscription takes them when it names none of its
 * own, so the dialog that subscribes reads them to say what "the organization's
 * terms" come to, and the settings screen edits them. It keeps the generated key,
 * so that `invalidateBillingSettingsQueries` refreshes it.
 *
 * A read of billing is not retried: a refusal is shown, with a way to ask again.
 */
export const billingSettingsQueryOptions = queryOptions({
  ...getBillingSettingsOptions(),
  retry: false,
  retryOnMount: false,
});
