import { z } from 'zod';
import type { InstanceBilling, SubscriptionTerms } from '@/api-client';
import { isValidDaysUntilDue } from '@/domains/billing';

const DAYS_UNTIL_DUE_ERROR_KEY =
  'Pages.Customers.Instances.Detail.Billing.Terms.Errors.daysUntilDue';

/**
 * What the payment terms dialog edits: the days between issuing an invoice and
 * its due date and, where Stripe can collect, who collects (`providerKind`) and how
 * (`collectionMethod`). An empty number reads as `NaN`, as it does in every number
 * field of the console, and is the answer "the organization's terms". The provider
 * and the method are absent from the form of an organization that has no payment
 * provider to choose, and then they are no part of the change.
 */
export const paymentTermsFormSchema = z.object({
  collectionMethod: z.enum(['SEND_INVOICE', 'CHARGE_AUTOMATICALLY']).optional(),
  daysUntilDue: z.custom<number>(
    (days) =>
      typeof days === 'number' &&
      (Number.isNaN(days) || isValidDaysUntilDue(days)),
    { error: DAYS_UNTIL_DUE_ERROR_KEY },
  ),
  providerKind: z.enum(['NOOP', 'STRIPE']).optional(),
});

export type PaymentTermsFormValues = z.infer<typeof paymentTermsFormSchema>;

/**
 * The body of the change: the days, or `null` for the organization's default, which is
 * how the API takes a member back to the default; the provider; and the collection
 * method. A member that is left out is left alone, so each is sent only when it differs
 * from what the subscription has: a switch to the provider it is on is no change, and a
 * change of provider does not touch the days. Passed no subscription, whatever the form
 * holds is sent.
 */
export const paymentTermsValuesToBody = (
  values: PaymentTermsFormValues,
  subscription?: Pick<
    InstanceBilling,
    'collectionMethod' | 'daysUntilDueOverride' | 'providerKind'
  >,
): SubscriptionTerms => {
  const days = Number.isNaN(values.daysUntilDue) ? null : values.daysUntilDue;
  const daysChanged =
    !subscription || days !== (subscription.daysUntilDueOverride ?? null);

  return {
    ...(daysChanged ? { daysUntilDue: days } : {}),
    ...(values.providerKind &&
    values.providerKind !== subscription?.providerKind
      ? { providerKind: values.providerKind }
      : {}),
    ...(values.collectionMethod &&
    values.collectionMethod !== subscription?.collectionMethod
      ? { collectionMethod: values.collectionMethod }
      : {}),
  };
};

/**
 * Where a refusal of the API is shown on the form: on the field it is about when that
 * field is there, above the buttons otherwise (a customer without a billing e-mail is
 * not about a field of this form).
 */
export const PAYMENT_TERMS_REFUSAL_FIELDS = {
  byCode: {
    'UpdateInstanceBilling.CollectionMethodUnsupported': 'collectionMethod',
    'UpdateInstanceBilling.InvalidDaysUntilDue': 'daysUntilDue',
    'UpdateInstanceBilling.PaymentMethodRequired': 'collectionMethod',
    'UpdateInstanceBilling.ProviderNotConnected': 'providerKind',
    'UpdateInstanceBilling.UnsupportedCurrency': 'providerKind',
  },
} as const;
