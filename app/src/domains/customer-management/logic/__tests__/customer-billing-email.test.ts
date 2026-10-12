import { describe, expect, it } from 'vite-plus/test';
import type { Customer } from '@/api-client';
import {
  BILLING_EMAIL_ERROR_KEYS,
  BILLING_EMAIL_MAX_LENGTH,
  billingEmailSchema,
  customerBillingEmailToUpdateBody,
  isValidBillingEmail,
} from '../customer-billing-email';

describe('isValidBillingEmail', () => {
  it.each([
    'ap@acme.com',
    'first.last+tag@sub.example.co.uk',
    // The API checks for something either side of an @ and no space, no more:
    // whether the address exists is the accounting system's business.
    'a@b',
    'été@exemple.fr',
  ])('takes %s', (email) => {
    expect(isValidBillingEmail(email)).toBe(true);
  });

  it.each([
    '',
    'acme.com',
    '@acme.com',
    'ap@',
    'ap@@acme.com',
    'ap@acme@com',
    'ap @acme.com',
    'ap@ acme.com',
    'ap@acme.com ',
  ])('refuses %j', (email) => {
    expect(isValidBillingEmail(email)).toBe(false);
  });

  it('counts the 254 characters of the API in bytes, as it does', () => {
    const ascii = `${'a'.repeat(BILLING_EMAIL_MAX_LENGTH - 'x@y'.length)}@y`;
    // "é" is two bytes: 127 of them with "@y" is 256 bytes and 129 characters.
    const accented = `${'é'.repeat(127)}@y`;

    expect(ascii).toHaveLength(BILLING_EMAIL_MAX_LENGTH - 1);
    expect(isValidBillingEmail(ascii)).toBe(true);
    expect(isValidBillingEmail(`${ascii}z`)).toBe(true);
    expect(isValidBillingEmail(`${ascii}zz`)).toBe(false);
    expect(accented.length).toBeLessThan(BILLING_EMAIL_MAX_LENGTH);
    expect(isValidBillingEmail(accented)).toBe(false);
  });
});

describe('billingEmailSchema', () => {
  it('takes no address, to have none', () => {
    expect(billingEmailSchema.safeParse('').success).toBe(true);
    expect(billingEmailSchema.safeParse('   ').success).toBe(true);
  });

  it('trims what a person pastes around an address', () => {
    expect(billingEmailSchema.parse('  ap@acme.com\n')).toBe('ap@acme.com');
  });

  it('says what is wrong in the words of the form', () => {
    const invalid = billingEmailSchema.safeParse('ap at acme');
    const tooLong = billingEmailSchema.safeParse(
      `${'a'.repeat(BILLING_EMAIL_MAX_LENGTH)}@acme.com`,
    );

    expect(invalid.error?.issues.map((issue) => issue.message)).toEqual([
      BILLING_EMAIL_ERROR_KEYS.invalid,
    ]);
    expect(tooLong.error?.issues.map((issue) => issue.message)).toContain(
      BILLING_EMAIL_ERROR_KEYS.tooLong,
    );
  });
});

describe('customerBillingEmailToUpdateBody', () => {
  const customer: Pick<Customer, 'domain' | 'externalCustomerId' | 'name'> = {
    domain: 'acme.com',
    externalCustomerId: 'hs-1',
    name: 'Acme',
  };

  it('restates the customer with the address, trimmed and with no slug', () => {
    expect(
      customerBillingEmailToUpdateBody(customer, ' ap@acme.com '),
    ).toEqual({
      billingEmail: 'ap@acme.com',
      domain: 'acme.com',
      externalCustomerId: 'hs-1',
      name: 'Acme',
    });
  });

  it('removes the address with an empty string, which the API reads as remove and not as keep', () => {
    expect(customerBillingEmailToUpdateBody(customer, '').billingEmail).toBe('');
  });

  it('leaves out an external id the customer has not', () => {
    expect(
      customerBillingEmailToUpdateBody(
        { name: 'Acme' },
        'ap@acme.com',
      ),
    ).toEqual({
      billingEmail: 'ap@acme.com',
      domain: undefined,
      externalCustomerId: undefined,
      name: 'Acme',
    });
  });
});
