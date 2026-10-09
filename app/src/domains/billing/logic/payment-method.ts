import type { CustomerBilling, PaymentMethodLabels } from '@/api-client';

/**
 * The default payment method a customer holds in Stripe, or none. The contract
 * declares the member of a customer that has no payment method as always there, and
 * the API sends `null`: this reads both, so that no screen is built on the declaration.
 */
export function getStripePaymentMethod(
  billing: Pick<CustomerBilling, 'providers'> | undefined,
): PaymentMethodLabels | null {
  const record = billing?.providers.find(
    (provider) => provider.providerKind === 'STRIPE',
  );

  return (
    (record?.paymentMethod as PaymentMethodLabels | null | undefined) ?? null
  );
}

/**
 * Whether Stripe can charge the customer by itself: it holds a payment method, and no
 * charge has said it is no longer usable (EXPIRED, FAILED). Charging automatically is
 * refused without one.
 */
export function hasUsablePaymentMethod(
  billing: Pick<CustomerBilling, 'providers'> | undefined,
): boolean {
  return getStripePaymentMethod(billing)?.status === 'ACTIVE';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long before the end of its expiry month a payment method is said to expire soon, as the API announces it. */
export const PAYMENT_METHOD_EXPIRING_DAYS = 30;

/**
 * Where a payment method stands:
 * - `none`: the customer holds none;
 * - `active`: Stripe charges it, and `expiresSoon` says it ends within thirty days of
 *   the last day of its expiry month, which is when the API announces it;
 * - `expired`, `failed`: a charge said it can no longer be used, and another has to be saved.
 */
export type PaymentMethodStanding =
  | { expiresSoon: boolean; kind: 'active' }
  | { kind: 'expired' | 'failed' | 'none' };

export function getPaymentMethodStanding(
  method: PaymentMethodLabels | null,
  now: number = Date.now(),
): PaymentMethodStanding {
  if (!method) {
    return { kind: 'none' };
  }
  if (method.status === 'EXPIRED') {
    return { kind: 'expired' };
  }
  if (method.status === 'FAILED') {
    return { kind: 'failed' };
  }
  // The card works through the last instant of its expiry month, in UTC.
  const lastInstant =
    method.expYear !== undefined && method.expMonth !== undefined
      ? Date.UTC(method.expYear, method.expMonth, 1) - 1
      : undefined;

  return {
    expiresSoon:
      lastInstant !== undefined &&
      lastInstant - now <= PAYMENT_METHOD_EXPIRING_DAYS * DAY_MS,
    kind: 'active',
  };
}
