import { describe, expect, it } from 'vite-plus/test';
import { getSafeProviderUrl } from '../provider-url';

describe('the address of a page the payment provider hosts', () => {
  it('is kept when it is an https address', () => {
    expect(getSafeProviderUrl('https://invoice.stripe.com/i/acct_1/in_1')).toBe(
      'https://invoice.stripe.com/i/acct_1/in_1',
    );
  });

  it('is written as the browser reads it', () => {
    expect(getSafeProviderUrl('HTTPS://Invoice.Stripe.com/pay?x=1')).toBe(
      'https://invoice.stripe.com/pay?x=1',
    );
  });

  it.each([
    'http://invoice.stripe.com/i/in_1',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//invoice.stripe.com/i/in_1',
    '/relative/path',
    'ftp://invoice.stripe.com/in_1',
    'not an address',
    '',
  ])('is no link when it is %j', (url) => {
    expect(getSafeProviderUrl(url)).toBeUndefined();
  });

  it('is no link when there is none', () => {
    expect(getSafeProviderUrl(undefined)).toBeUndefined();
    expect(getSafeProviderUrl(null)).toBeUndefined();
  });
});
