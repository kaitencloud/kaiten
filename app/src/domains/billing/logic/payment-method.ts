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
