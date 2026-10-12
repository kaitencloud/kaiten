import { describe, expect, it } from 'vite-plus/test';
import type { Customer } from '@/api-client';
import { zCustomer } from '@/api-client/zod.gen';
import {
  customerFormSchema,
  customerFormValuesToCreateBody,
  customerFormValuesToUpdateBody,
  customerToFormValues,
} from '../customer-form.shared';

const formValues = {
  name: 'Acme',
  externalCustomerId: '',
  billingEmail: '',
  slug: '',
};

describe('customerFormSchema', () => {
  it('accepts an empty controlled domain value', () => {
    expect(
      customerFormSchema.safeParse({ ...formValues, domain: '' }).success,
    ).toBe(true);
  });

  it('follows the generated API domain validation', () => {
    for (const domain of ['acme.com', 'invalid domain', 'localhost']) {
      expect(
        customerFormSchema.safeParse({ ...formValues, domain }).success,
      ).toBe(zCustomer.shape.domain.safeParse(domain).success);
    }
  });

  it('uses the localized form error for an invalid domain', () => {
    const result = customerFormSchema.safeParse({
      ...formValues,
      domain: 'invalid domain',
    });

    expect(result.error?.issues[0]?.message).toBe(
      'Pages.Customers.Mutation.Form.Errors.domain',
    );
  });

  it('accepts no billing e-mail, and an address of up to 254 characters', () => {
    const address = `${'a'.repeat(242)}@example.com`;

    expect(address).toHaveLength(254);
    for (const billingEmail of ['', 'billing@acme.com', address]) {
      expect(
        customerFormSchema.safeParse({ ...formValues, billingEmail, domain: '' })
          .success,
      ).toBe(true);
    }
  });

  it('says why a billing e-mail is refused, in the words of the form', () => {
    const invalid = customerFormSchema.safeParse({
      ...formValues,
      billingEmail: 'not an address',
      domain: '',
    });
    const tooLong = customerFormSchema.safeParse({
      ...formValues,
      billingEmail: `${'a'.repeat(250)}@example.com`,
      domain: '',
    });

    expect(invalid.error?.issues[0]?.message).toBe(
      'Pages.Customers.Mutation.Form.Errors.billingEmail',
    );
    expect(tooLong.error?.issues[0]?.message).toBe(
      'Pages.Customers.Mutation.Form.Errors.billingEmailTooLong',
    );
  });

  it('accepts a valid optional slug', () => {
    expect(
      customerFormSchema.safeParse({
        ...formValues,
        domain: '',
        slug: 'acme-inc',
      }).success,
    ).toBe(true);
  });
});

describe('customerFormValuesToCreateBody', () => {
  it('omits an empty slug so the API generates one', () => {
    const body = customerFormValuesToCreateBody({ ...formValues, domain: '' });
    expect(body.slug).toBeUndefined();
  });

  it('keeps a provided slug', () => {
    const body = customerFormValuesToCreateBody({
      ...formValues,
      domain: '',
      slug: 'acme-inc',
    });
    expect(body.slug).toBe('acme-inc');
  });

  it('sends a billing e-mail trimmed, and none when there is none', () => {
    expect(
      customerFormValuesToCreateBody({
        ...formValues,
        billingEmail: '  ap@acme.com ',
        domain: '',
      }).billingEmail,
    ).toBe('ap@acme.com');
    expect(
      customerFormValuesToCreateBody({
        ...formValues,
        billingEmail: '   ',
        domain: '',
      }).billingEmail,
    ).toBeUndefined();
  });
});

describe('customerFormValuesToUpdateBody', () => {
  it('never sends a slug (the update API does not accept it)', () => {
    const body = customerFormValuesToUpdateBody({
      ...formValues,
      domain: '',
      slug: 'acme-inc',
    });
    expect(Object.keys(body)).not.toContain('slug');
  });

  it('sends the billing e-mail it holds, and an empty string to remove it', () => {
    expect(
      customerFormValuesToUpdateBody({
        ...formValues,
        billingEmail: ' ap@acme.com',
        domain: '',
      }).billingEmail,
    ).toBe('ap@acme.com');
    // The API keeps the stored address when the member is left out and removes
    // it for an empty string, and ignores null: the form never sends null.
    expect(
      customerFormValuesToUpdateBody({ ...formValues, domain: '' }),
    ).toHaveProperty('billingEmail', '');
  });
});

describe('customerToFormValues', () => {
  it('opens a customer with the billing e-mail it has, or an empty field', () => {
    const customer = {
      id: 'c1',
      name: 'Acme',
      slug: 'acme',
    } as Customer;

    expect(customerToFormValues(customer).billingEmail).toBe('');
    expect(
      customerToFormValues({ ...customer, billingEmail: 'ap@acme.com' })
        .billingEmail,
    ).toBe('ap@acme.com');
  });
});
