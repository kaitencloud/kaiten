import { z } from 'zod';
import {
  BILLING_EMAIL_ERROR_KEYS,
  billingEmailSchema,
} from '@/domains/customer-management';

/**
 * The billing e-mail asked for in the dialog that subscribes an instance. It is the
 * address of the customer form (at most 254 characters, with an @ and no space),
 * but here it is asked for, so that leaving it empty is not the "remove it" of the
 * form of a customer: there is nothing to remove.
 */
export const billingEmailNoticeSchema = z.object({
  billingEmail: billingEmailSchema.refine(
    (email) => email !== '',
    BILLING_EMAIL_ERROR_KEYS.invalid,
  ),
});

export type BillingEmailNoticeValues = z.infer<typeof billingEmailNoticeSchema>;
