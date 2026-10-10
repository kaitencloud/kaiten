import { describe, expect, it } from 'vite-plus/test';
import type { CustomerBilling } from '@/api-client';
import {
  getPaymentMethodStanding,
  getStripePaymentMethod,
  hasUsablePaymentMethod,
} from '../logic';

const billing = (
  paymentMethod: unknown,
  providerKind: 'STRIPE' = 'STRIPE',
): Pick<CustomerBilling, 'providers'> => ({
  providers: [
    {
      externalCustomerId: 'cus_1',
      paymentMethod: paymentMethod as never,
      providerKind,
      syncedAt: null,
      webUrl: null,
    },
  ],
});

describe('the payment method a customer holds in Stripe', () => {
  it('is the default one the API gives', () => {
    expect(
      getStripePaymentMethod(billing({ last4: '4242', status: 'ACTIVE' })),
    ).toEqual({ last4: '4242', status: 'ACTIVE' });
  });

  it('is none when the API says null, which its contract declares for a customer with no default method', () => {
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

describe('where a payment method stands', () => {
  const NOW = Date.parse('2027-03-10T12:00:00.000Z');

  it('is none for a customer without one', () => {
    expect(getPaymentMethodStanding(null, NOW)).toEqual({ kind: 'none' });
  });

  it.each(['EXPIRED', 'FAILED'] as const)(
    'is %s once a charge said so, whatever its expiry says',
    (status) => {
      expect(
        getPaymentMethodStanding({ expMonth: 12, expYear: 2040, status }, NOW),
      ).toEqual({ kind: status.toLowerCase() });
    },
  );

  it('is active and far from its end for a card that expires years away', () => {
    expect(
      getPaymentMethodStanding({ expMonth: 12, expYear: 2030, status: 'ACTIVE' }, NOW),
    ).toEqual({ expiresSoon: false, kind: 'active' });
  });

  it('expires soon within thirty days of the last day of its month, and works through that day', () => {
    // March 2027 ends on the 31st at midnight: the card is soon to expire all month.
    expect(
      getPaymentMethodStanding({ expMonth: 3, expYear: 2027, status: 'ACTIVE' }, NOW),
    ).toEqual({ expiresSoon: true, kind: 'active' });
    // April 2027 ends 51 days after the 10th of March: not yet.
    expect(
      getPaymentMethodStanding({ expMonth: 4, expYear: 2027, status: 'ACTIVE' }, NOW),
    ).toEqual({ expiresSoon: false, kind: 'active' });
    // April 2027 is within thirty days of the 10th of April.
    expect(
      getPaymentMethodStanding(
        { expMonth: 4, expYear: 2027, status: 'ACTIVE' },
        Date.parse('2027-04-10T12:00:00.000Z'),
      ),
    ).toEqual({ expiresSoon: true, kind: 'active' });
  });

  it('says nothing of the expiry of a card that has none on record', () => {
    expect(getPaymentMethodStanding({ status: 'ACTIVE' }, NOW)).toEqual({
      expiresSoon: false,
      kind: 'active',
    });
  });
});
