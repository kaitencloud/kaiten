import { z } from 'zod';
import type { SubscriptionTerms } from '@/api-client';
import { isValidDaysUntilDue } from '@/domains/billing';

const DAYS_UNTIL_DUE_ERROR_KEY =
  'Pages.Customers.Instances.Detail.Billing.Terms.Errors.daysUntilDue';

/**
 * What the payment terms dialog edits: the days between issuing an invoice and
 * its due date. An empty number reads as `NaN`, as it does in every number field
 * of the console, and is the answer "the organization's terms".
 */
export const paymentTermsFormSchema = z.object({
  daysUntilDue: z.custom<number>(
    (days) =>
      typeof days === 'number' &&
      (Number.isNaN(days) || isValidDaysUntilDue(days)),
    { error: DAYS_UNTIL_DUE_ERROR_KEY },
  ),
});

export type PaymentTermsFormValues = z.infer<typeof paymentTermsFormSchema>;

/**
 * The body of the change: the days, or `null` for the organization's default,
 * which is how the API takes a member back to the default. Only the days are
 * sent: the collection method and the provider belong to the Stripe screens, and
 * a member that is left out is left alone.
 */
export const paymentTermsValuesToBody = (
  values: PaymentTermsFormValues,
): SubscriptionTerms => ({
  daysUntilDue: Number.isNaN(values.daysUntilDue) ? null : values.daysUntilDue,
});

/** Where a refusal of the API is shown on the form. */
export const PAYMENT_TERMS_REFUSAL_FIELDS = {
  byCode: { 'UpdateInstanceBilling.InvalidDaysUntilDue': 'daysUntilDue' },
} as const;
