import { getProblem } from '@/domains/billing';

/** What still routes to Stripe, as a refused disconnect counts it. */
export type StripeRouting = {
  activeSubscriptions: number;
  openInvoices: number;
};

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * What keeps Stripe connected: the 409 `*.BillingActive` of the deactivation (and
 * of the deletion of its settings) carries in `errors[0].value` how many
 * subscriptions are not canceled and how many invoices are not settled. Anything
 * else is no such refusal.
 */
export function readStripeRouting(error: unknown): StripeRouting | undefined {
  const problem = getProblem(error);
  if (!problem?.code?.endsWith('.BillingActive')) {
    return undefined;
  }
  const value = problem.errors?.[0]?.value;
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { activeSubscriptions, openInvoices } = value as Record<
    string,
    unknown
  >;

  return isCount(activeSubscriptions) && isCount(openInvoices)
    ? { activeSubscriptions, openInvoices }
    : undefined;
}
