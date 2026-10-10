import { z } from 'zod';
import type { Customer, CustomerWritable } from '@/api-client';

/** The messages of a billing e-mail that does not pass: translation keys, as a form shows them. */
export const BILLING_EMAIL_ERROR_KEYS = {
  invalid: 'Pages.Customers.Mutation.Form.Errors.billingEmail',
  tooLong: 'Pages.Customers.Mutation.Form.Errors.billingEmailTooLong',
} as const;

/** The most bytes the API accepts in the billing e-mail of a customer. */
export const BILLING_EMAIL_MAX_LENGTH = 254;

// What the API accepts (customers/schema: ValidateBillingEmail): something before
// an @, something after it, and no space. Whether the address exists is the
// accounting system's business, not the console's.
const BILLING_EMAIL = /^[^@\s]+@[^@\s]+$/;

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

/** Whether the API will take `email` as the billing e-mail of a customer. */
export function isValidBillingEmail(email: string): boolean {
  return (
    BILLING_EMAIL.test(email) && utf8Length(email) <= BILLING_EMAIL_MAX_LENGTH
  );
}

/**
 * The billing e-mail of a customer as a form edits it: empty to have none, else an
 * address of at most 254 characters. The text is trimmed first, since a space
 * pasted around an address is never meant.
 */
export const billingEmailSchema = z
  .string()
  .trim()
  .refine(
    (email) => utf8Length(email) <= BILLING_EMAIL_MAX_LENGTH,
    BILLING_EMAIL_ERROR_KEYS.tooLong,
  )
  .refine(
    (email) => email === '' || isValidBillingEmail(email),
    BILLING_EMAIL_ERROR_KEYS.invalid,
  );

/**
 * The body of an update that sets only the billing e-mail of `customer`. The PUT
 * restates the customer, so its name, its external id and its domain are sent as
 * they are; the slug is left out, as the update never takes a new one. An empty
 * address removes the e-mail, which the API reads as "remove" and not as "keep".
 */
export function customerBillingEmailToUpdateBody(
  customer: Pick<Customer, 'domain' | 'externalCustomerId' | 'name'>,
  billingEmail: string,
): CustomerWritable {
  return {
    billingEmail: billingEmail.trim(),
    domain: customer.domain,
    externalCustomerId: customer.externalCustomerId ?? undefined,
    name: customer.name,
  };
}
