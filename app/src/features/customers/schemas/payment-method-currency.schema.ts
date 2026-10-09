import { z } from 'zod';
import { zNewPaymentMethodSession } from '@/api-client/zod.gen';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';

const CURRENCY_ERROR_KEY =
  'Pages.Customers.Detail.paymentMethod.Currency.Errors.currency';

/**
 * The currency a payment method is set up in, for a customer that has no live
 * subscription to take it from. It is an ISO 4217 code the API knows (the same table
 * the prices are drawn from), picked from the list; the API checks it too.
 */
export const paymentMethodCurrencySchema = z.object({
  // The currency of the request the API takes, here required and one it knows.
  currency: zNewPaymentMethodSession.shape.currency
    .unwrap()
    .refine((code) => CURRENCY_EXPONENTS.has(code), {
      error: CURRENCY_ERROR_KEY,
    }),
});

export type PaymentMethodCurrencyValues = z.infer<
  typeof paymentMethodCurrencySchema
>;

/** The codes the list offers, in order. */
export const PAYMENT_METHOD_CURRENCIES = [...CURRENCY_EXPONENTS.keys()].sort();

/** Where a refusal of the API is shown on the form: on the currency. */
export const PAYMENT_METHOD_CURRENCY_REFUSAL_FIELDS = {
  byCode: {
    'CreatePaymentMethodSession.CurrencyRequired': 'currency',
    'CreatePaymentMethodSession.InvalidCurrency': 'currency',
  },
} as const;
