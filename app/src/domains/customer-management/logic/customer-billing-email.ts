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

type RestatedCustomer = Pick<
  Customer,
  'billingEmail' | 'domain' | 'externalCustomerId' | 'name'
>;

/**
 * The update that restates a customer as it stands. The PUT takes the customer
 * as a whole, so its name, its external id, its domain and its billing e-mail are
 * sent as they are; the slug is left out, as the update never takes a new one,
 * and so are the integrations, which it does not set. A member the customer has
 * not is left out, except the address, which is an empty string: the API reads
 * that as "remove" and not as "keep", and there is nothing to remove.
 */
export function customerToUpdateBody(
  customer: Partial<RestatedCustomer> & Pick<Customer, 'name'>,
): CustomerWritable {
  return {
    billingEmail: customer.billingEmail ?? '',
    domain: customer.domain || undefined,
    externalCustomerId: customer.externalCustomerId || undefined,
    name: customer.name,
  };
}

/**
 * The body of an update that sets only the billing e-mail of `customer`: the
 * customer as it stands (`customerToUpdateBody`) with the address replaced. An
 * empty address removes the e-mail, which the API reads as "remove" and not as
 * "keep".
 */
export function customerBillingEmailToUpdateBody(
  customer: Partial<RestatedCustomer> & Pick<Customer, 'name'>,
  billingEmail: string,
): CustomerWritable {
  return {
    ...customerToUpdateBody(customer),
    billingEmail: billingEmail.trim(),
  };
}
