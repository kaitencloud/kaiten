import { z } from 'zod';
import type { CustomerWritable, Customer } from '@/api-client';
import { zCustomer } from '@/api-client/zod.gen';
import { billingEmailSchema } from '@/domains/customer-management';

const customerDomainSchema = z
  .string()
  .refine(
    (domain) =>
      domain === '' || zCustomer.shape.domain.safeParse(domain).success,
    {
      message: 'Pages.Customers.Mutation.Form.Errors.domain',
    },
  );

// Accept an empty string so the optional slug can be left blank in the form.
const optionalField = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  schema.or(z.literal(''));

export const customerFormSchema = zCustomer
  .pick({
    externalCustomerId: true,
  })
  .extend({
    name: z.string().min(1, {
      message: 'Pages.Customers.Mutation.Form.Errors.name',
    }),
    domain: customerDomainSchema,
    // Optional, and empty to have none: at most 254 characters, as the API takes it.
    billingEmail: billingEmailSchema,
    // Optional — left empty, the API generates the slug. Create-only: update
    // rejects a slug that differs from the current one with a 422 (the API's
    // Customer schema is shared across create/update/read, so this is
    // enforced server-side rather than by a narrower update-only wire type).
    slug: optionalField(zCustomer.shape.slug.unwrap()),
  });

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

export const initialCustomerFormValues: CustomerFormValues = {
  name: '',
  externalCustomerId: '',
  domain: '',
  billingEmail: '',
  slug: '',
};

export const customerToFormValues = (
  customer: Customer,
): CustomerFormValues => ({
  name: customer.name,
  externalCustomerId: customer.externalCustomerId ?? '',
  domain: customer.domain ?? '',
  billingEmail: customer.billingEmail ?? '',
  slug: customer.slug ?? '',
});

const toOptionalField = (
  value: string | null | undefined,
): string | undefined =>
  value == null || value.trim() === '' ? undefined : value;

export const customerFormValuesToCreateBody = (
  values: CustomerFormValues,
): CustomerWritable => ({
  name: values.name,
  externalCustomerId: toOptionalField(values.externalCustomerId),
  domain: toOptionalField(values.domain),
  // A customer is created with an address or without one.
  billingEmail: toOptionalField(values.billingEmail.trim()),
  slug: toOptionalField(values.slug),
});

// Deliberately omits slug: the update endpoint rejects one that differs from
// the current value (see customerFormSchema's slug comment above). Kept as
// its own function, distinct from customerFormValuesToCreateBody, so intent
// stays visible at the call site even though both now return CustomerWritable.
export const customerFormValuesToUpdateBody = (
  values: CustomerFormValues,
): CustomerWritable => ({
  name: values.name,
  externalCustomerId: toOptionalField(values.externalCustomerId),
  domain: toOptionalField(values.domain),
  // An update keeps the stored address when the member is left out and removes it
  // for an empty string, so what the form holds is always sent: the address it
  // was opened with, or the one that was typed, or nothing to clear it. Never null.
  billingEmail: values.billingEmail.trim(),
});

/**
 * Where a refusal of the API is shown on the form: the address, whose check the
 * form repeats, is refused by the API with a code of its own on create and update.
 * Anything else is a toast.
 */
export const CUSTOMER_REFUSAL_FIELDS = {
  byCode: {
    'CreateCustomer.InvalidBillingEmail': 'billingEmail',
    'UpdateCustomer.InvalidBillingEmail': 'billingEmail',
  },
} as const;
