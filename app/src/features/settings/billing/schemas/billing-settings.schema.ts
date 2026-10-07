import { z } from 'zod';
import type { BillingSettings } from '@/api-client';
import { zBillingSettings } from '@/api-client/zod.gen';
import { isValidDaysUntilDue } from '@/domains/billing';

export const DAYS_UNTIL_DUE_ERROR_KEY =
  'Pages.Settings.Billing.Defaults.Errors.daysUntilDue';

/**
 * What the defaults of the organization are edited as. The API takes the three
 * members together (a PUT replaces them), so the form holds all three, whether or
 * not it shows them. An empty number reads as `NaN`, as it does in every number
 * field of the console.
 */
export const billingSettingsFormSchema = zBillingSettings.extend({
  // An empty field reads as NaN, which the number check would refuse in its own
  // words: the form says it in its own.
  defaultDaysUntilDue: z
    .number({ error: DAYS_UNTIL_DUE_ERROR_KEY })
    .refine(isValidDaysUntilDue, DAYS_UNTIL_DUE_ERROR_KEY),
});

export type BillingSettingsFormValues = z.infer<
  typeof billingSettingsFormSchema
>;

/** The form as it opens: what the organization has now. */
export const billingSettingsToFormValues = (
  settings: BillingSettings,
): BillingSettingsFormValues => ({
  defaultCollectionMethod: settings.defaultCollectionMethod,
  defaultDaysUntilDue: settings.defaultDaysUntilDue,
  handoffStripeInvoices: settings.handoffStripeInvoices,
});

/**
 * The body of the update, which replaces the three members. A member the form
 * does not show (whether to hand Stripe invoices off, before Stripe is shipped)
 * is sent as it is stored, so that saving the others never changes it.
 */
export const billingSettingsFormValuesToBody = (
  values: BillingSettingsFormValues,
): BillingSettings => ({
  defaultCollectionMethod: values.defaultCollectionMethod,
  defaultDaysUntilDue: values.defaultDaysUntilDue,
  handoffStripeInvoices: values.handoffStripeInvoices,
});

/**
 * Where a refusal of the API is shown on the form: it names the field in prose
 * and does not locate it, so the code says which it is.
 */
export const BILLING_SETTINGS_REFUSAL_FIELDS = {
  byCode: {
    'UpdateBillingSettings.InvalidCollectionMethod': 'defaultCollectionMethod',
    'UpdateBillingSettings.InvalidDaysUntilDue': 'defaultDaysUntilDue',
  },
  byLocation: {
    defaultCollectionMethod: 'defaultCollectionMethod',
    defaultDaysUntilDue: 'defaultDaysUntilDue',
    handoffStripeInvoices: 'handoffStripeInvoices',
  },
} as const;
