import { describe, expect, it } from 'vite-plus/test';
import {
  PAYMENT_METHOD_CURRENCIES,
  PAYMENT_METHOD_CURRENCY_REFUSAL_FIELDS,
  paymentMethodCurrencySchema,
} from '../payment-method-currency.schema';

describe('the currency a payment method is set up in', () => {
  it.each(['USD', 'EUR', 'JPY', 'KWD'])('accepts %s', (currency) => {
    expect(paymentMethodCurrencySchema.safeParse({ currency }).success).toBe(true);
  });

  it.each(['', 'usd', 'US', 'DOLLAR', 'XXX'])(
    'refuses %j, in the words of the form',
    (currency) => {
      const result = paymentMethodCurrencySchema.safeParse({ currency });

      expect(result.success).toBe(false);
      expect(
        result.success ? [] : result.error.issues.map(({ message }) => message),
      ).toEqual(['Pages.Customers.Detail.paymentMethod.Currency.Errors.currency']);
    },
  );

  it('offers the codes the API knows, in order', () => {
    expect(PAYMENT_METHOD_CURRENCIES.slice(0, 3)).toEqual(['AED', 'AFN', 'ALL']);
    expect(PAYMENT_METHOD_CURRENCIES).toContain('EUR');
    expect([...PAYMENT_METHOD_CURRENCIES].sort()).toEqual(PAYMENT_METHOD_CURRENCIES);
  });

  it('shows the refusals about the currency on the field', () => {
    expect(PAYMENT_METHOD_CURRENCY_REFUSAL_FIELDS.byCode).toEqual({
      'CreatePaymentMethodSession.CurrencyRequired': 'currency',
      'CreatePaymentMethodSession.InvalidCurrency': 'currency',
    });
  });
});
