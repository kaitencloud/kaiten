import { describe, expect, it } from 'vite-plus/test';
import { zCustomer } from '@/api-client/zod.gen';
import {
  customerFormSchema,
  customerFormValuesToCreateBody,
  customerFormValuesToUpdateBody,
} from '../customer-form.shared';

const formValues = {
  name: 'Acme',
  externalCustomerId: '',
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
});
