import { buildCheckoutSession } from '../../../../e2e/app/_support/fixtures/build-checkout-session';
import type { BillingCheckoutSessionsSeed } from '../../../../e2e/app/_support/model/billing-checkout-sessions';
import { daysAgo, minutesAgo } from './dates';

/**
 * The anonymous checkouts the staging storefront started, one in every state the page
 * shows: one still open, one waiting for its payment, a completed one that created a
 * customer and an instance (and linked back by the vendor's own reference), an
 * abandoned one, and one that expired after the customer and the instance were made.
 * They point at customers and instances of the world, so that the links lead somewhere.
 */
export function createCheckoutSessions(): BillingCheckoutSessionsSeed {
  const key = 'publishable-key-staging';

  return {
    sessions: [
      buildCheckoutSession({
        createdAt: minutesAgo(20),
        email: 'dana@hooli.test',
        publishableKeyId: key,
        sessionId: 'checkout-open',
        status: 'OPEN',
      }),
      buildCheckoutSession({
        createdAt: minutesAgo(90),
        email: 'ravi@initech.test',
        publishableKeyId: key,
        sessionId: 'checkout-awaiting',
        status: 'AWAITING_PAYMENT',
      }),
      buildCheckoutSession({
        clientReferenceId: 'cmp-42',
        createdAt: daysAgo(3),
        customerSlug: 'acme-corp',
        email: 'alice@acme.test',
        instanceSlug: 'acme-production',
        publishableKeyId: key,
        sessionId: 'checkout-completed',
        status: 'COMPLETED',
        trialEndsAt: daysAgo(-11),
      }),
      buildCheckoutSession({
        createdAt: daysAgo(6),
        email: 'visitor@example.test',
        publishableKeyId: key,
        sessionId: 'checkout-abandoned',
        status: 'ABANDONED',
      }),
      buildCheckoutSession({
        clientReferenceId: 'cmp-77',
        createdAt: daysAgo(9),
        customerSlug: 'globex',
        email: 'finance@globex.test',
        instanceSlug: 'globex-production',
        publishableKeyId: key,
        sessionId: 'checkout-expired',
        status: 'EXPIRED',
      }),
    ],
  };
}
