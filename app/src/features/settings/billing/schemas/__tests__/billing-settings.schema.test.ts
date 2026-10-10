import { describe, expect, it } from 'vite-plus/test';
import { MAX_DAYS_UNTIL_DUE } from '@/domains/billing';
import {
  BILLING_SETTINGS_REFUSAL_FIELDS,
  billingSettingsFormSchema,
  billingSettingsFormValuesToBody,
  billingSettingsToFormValues,
  DAYS_UNTIL_DUE_ERROR_KEY,
} from '../billing-settings.schema';

const values = {
  defaultCollectionMethod: 'SEND_INVOICE' as const,
  defaultDaysUntilDue: 30,
  handoffStripeInvoices: true,
};

describe('the payment terms of the defaults', () => {
  it.each([0, 1, 30, MAX_DAYS_UNTIL_DUE])('accepts %i days', (days) => {
    expect(
      billingSettingsFormSchema.safeParse({ ...values, defaultDaysUntilDue: days })
        .success,
    ).toBe(true);
  });

  it.each([-1, 366, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses %s days, in the words of the form',
    (days) => {
      const result = billingSettingsFormSchema.safeParse({
        ...values,
        defaultDaysUntilDue: days,
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(DAYS_UNTIL_DUE_ERROR_KEY);
    },
  );
});

describe('the form of the defaults', () => {
  it('opens on the three members the organization has', () => {
    expect(
      billingSettingsToFormValues({
        defaultCollectionMethod: 'SEND_INVOICE',
        defaultDaysUntilDue: 45,
        handoffStripeInvoices: true,
      }),
    ).toEqual({
      defaultCollectionMethod: 'SEND_INVOICE',
      defaultDaysUntilDue: 45,
      handoffStripeInvoices: true,
    });
  });

  it('replaces the three members, the one it does not show included', () => {
    expect(
      billingSettingsFormValuesToBody({ ...values, defaultDaysUntilDue: 60 }),
    ).toEqual({
      defaultCollectionMethod: 'SEND_INVOICE',
      defaultDaysUntilDue: 60,
      handoffStripeInvoices: true,
    });
  });

  it('knows which field each refusal of the API is about', () => {
    expect(BILLING_SETTINGS_REFUSAL_FIELDS.byCode).toEqual({
      'UpdateBillingSettings.InvalidCollectionMethod': 'defaultCollectionMethod',
      'UpdateBillingSettings.InvalidDaysUntilDue': 'defaultDaysUntilDue',
    });
  });
});
