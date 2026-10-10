import { describe, expect, it } from 'vite-plus/test';
import { MAX_DAYS_UNTIL_DUE } from '@/domains/billing';
import {
  PAYMENT_TERMS_REFUSAL_FIELDS,
  type PaymentTermsFormValues,
  paymentTermsFormSchema,
  paymentTermsValuesToBody,
} from '../payment-terms.schema';

const check = (daysUntilDue: number) => paymentTermsFormSchema.safeParse({ daysUntilDue });

describe('the days an invoice may be paid in', () => {
  it.each([0, 1, 30, 45, MAX_DAYS_UNTIL_DUE])('accepts %i', (days) => {
    expect(check(days).success).toBe(true);
  });

  it('accepts none, which is the terms of the organization', () => {
    expect(check(Number.NaN).success).toBe(true);
  });

  it.each([-1, MAX_DAYS_UNTIL_DUE + 1, 2.5, Number.POSITIVE_INFINITY])(
    'refuses %s, in the words of the form',
    (days) => {
      const result = check(days);

      expect(result.success).toBe(false);
      expect(result.success ? [] : result.error.issues.map(({ message }) => message)).toEqual([
        'Pages.Customers.Instances.Detail.Billing.Terms.Errors.daysUntilDue',
      ]);
    },
  );
});

describe('the body of a change of terms', () => {
  it('carries the days, and only the days, when the form has no provider to choose', () => {
    expect(paymentTermsValuesToBody({ daysUntilDue: 45 })).toEqual({ daysUntilDue: 45 });
    expect(Object.keys(paymentTermsValuesToBody({ daysUntilDue: 0 }))).toEqual(['daysUntilDue']);
  });

  it('sends zero as zero, which is due on receipt and not the default', () => {
    expect(paymentTermsValuesToBody({ daysUntilDue: 0 })).toEqual({ daysUntilDue: 0 });
  });

  it('sends null for an empty number, which takes the subscription back to the organization\'s terms', () => {
    expect(paymentTermsValuesToBody({ daysUntilDue: Number.NaN })).toEqual({
      daysUntilDue: null,
    });
  });
});

describe('the body of a change of provider and terms', () => {
  const subscription = {
    collectionMethod: 'SEND_INVOICE',
    daysUntilDueOverride: null,
    providerKind: 'NOOP',
  } as const;
  const values = (overrides: Partial<PaymentTermsFormValues> = {}): PaymentTermsFormValues => ({
    collectionMethod: 'SEND_INVOICE',
    daysUntilDue: Number.NaN,
    providerKind: 'NOOP',
    ...overrides,
  });

  it('sends the provider alone when only the provider changes, the days being what they were', () => {
    expect(
      paymentTermsValuesToBody(values({ providerKind: 'STRIPE' }), subscription),
    ).toEqual({ providerKind: 'STRIPE' });
  });

  it('sends nothing when nothing changes', () => {
    expect(paymentTermsValuesToBody(values(), subscription)).toEqual({});
  });

  it('sends the collection method when it changes, and not when it does not', () => {
    expect(
      paymentTermsValuesToBody(
        values({ collectionMethod: 'CHARGE_AUTOMATICALLY', providerKind: 'STRIPE' }),
        subscription,
      ),
    ).toEqual({
      collectionMethod: 'CHARGE_AUTOMATICALLY',
      providerKind: 'STRIPE',
    });
  });

  it('sends the method back to sending the invoice with a switch away from a provider that charges', () => {
    expect(
      paymentTermsValuesToBody(values(), {
        collectionMethod: 'CHARGE_AUTOMATICALLY',
        daysUntilDueOverride: null,
        providerKind: 'STRIPE',
      }),
    ).toEqual({ collectionMethod: 'SEND_INVOICE', providerKind: 'NOOP' });
  });

  it('sends the days with them when they changed', () => {
    expect(
      paymentTermsValuesToBody(values({ daysUntilDue: 14, providerKind: 'STRIPE' }), subscription),
    ).toEqual({ daysUntilDue: 14, providerKind: 'STRIPE' });
  });

  it('sends the days alone when only they change, as before', () => {
    expect(paymentTermsValuesToBody(values({ daysUntilDue: 45 }), subscription)).toEqual({
      daysUntilDue: 45,
    });
  });

  it('sends null when the days an own-terms contract had are emptied', () => {
    expect(
      paymentTermsValuesToBody(values(), { ...subscription, daysUntilDueOverride: 45 }),
    ).toEqual({ daysUntilDue: null });
  });

  it('sends the days it holds when they are the same as the contract has, if it is not told what the contract has', () => {
    expect(paymentTermsValuesToBody(values({ daysUntilDue: 45, providerKind: 'STRIPE' }))).toEqual({
      collectionMethod: 'SEND_INVOICE',
      daysUntilDue: 45,
      providerKind: 'STRIPE',
    });
  });
});

describe('where a refusal of the terms is shown', () => {
  it('puts it on the field it is about: the days, the method or the provider', () => {
    expect(PAYMENT_TERMS_REFUSAL_FIELDS.byCode).toEqual({
      'UpdateInstanceBilling.CollectionMethodUnsupported': 'collectionMethod',
      'UpdateInstanceBilling.InvalidDaysUntilDue': 'daysUntilDue',
      'UpdateInstanceBilling.PaymentMethodRequired': 'collectionMethod',
      'UpdateInstanceBilling.ProviderNotConnected': 'providerKind',
      'UpdateInstanceBilling.UnsupportedCurrency': 'providerKind',
    });
  });
});
