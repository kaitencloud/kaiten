import { describe, expect, it } from 'vite-plus/test';
import type { CustomerBilling } from '@/api-client';
import { getStripePaymentMethod, hasUsablePaymentMethod } from '../logic';

const billing = (
  paymentMethod: unknown,
  providerKind: 'STRIPE' = 'STRIPE',
): Pick<CustomerBilling, 'providers'> => ({
  providers: [
    {
      externalCustomerId: 'cus_1',
      paymentMethod: paymentMethod as never,
      providerKind,
    },
  ],
});

describe('the payment method a customer holds in Stripe', () => {
  it('is the default one the API gives', () => {
    expect(
      getStripePaymentMethod(billing({ last4: '4242', status: 'ACTIVE' })),
    ).toEqual({ last4: '4242', status: 'ACTIVE' });
  });

  it('is none when the API says null, which its contract declares it never does', () => {
    expect(getStripePaymentMethod(billing(null))).toBeNull();
  });

  it('is none for a customer that has never been to Stripe, or is not read', () => {
    expect(getStripePaymentMethod({ providers: [] })).toBeNull();
    expect(getStripePaymentMethod(undefined)).toBeNull();
  });
});

describe('whether Stripe can charge the customer by itself', () => {
  it('can with a method that is active', () => {
    expect(hasUsablePaymentMethod(billing({ status: 'ACTIVE' }))).toBe(true);
  });

  it.each(['EXPIRED', 'FAILED'])(
    'cannot with one a charge said is no longer usable (%s)',
    (status) => {
      expect(hasUsablePaymentMethod(billing({ status }))).toBe(false);
    },
  );

  it('cannot with none', () => {
    expect(hasUsablePaymentMethod(billing(null))).toBe(false);
    expect(hasUsablePaymentMethod(undefined)).toBe(false);
  });
});
