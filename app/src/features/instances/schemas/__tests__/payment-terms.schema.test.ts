import { describe, expect, it } from 'vite-plus/test';
import { MAX_DAYS_UNTIL_DUE } from '@/domains/billing';
import {
  PAYMENT_TERMS_REFUSAL_FIELDS,
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
  it('carries the days, and only the days: the collection method and the provider are not this screen\'s', () => {
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

describe('where a refusal of the terms is shown', () => {
  it('puts it on the days', () => {
    expect(PAYMENT_TERMS_REFUSAL_FIELDS.byCode).toEqual({
      'UpdateInstanceBilling.InvalidDaysUntilDue': 'daysUntilDue',
    });
  });
});
