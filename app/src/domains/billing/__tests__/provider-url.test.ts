import { describe, expect, it } from 'vite-plus/test';
import { getSafeProviderUrl, getStripeInvoiceDashboardUrl } from '../logic';

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

describe('the page of an invoice in the dashboard of Stripe', () => {
  it('is in the mode the connection reaches, since the dashboard keeps them apart', () => {
    expect(getStripeInvoiceDashboardUrl(true, 'in_1Abc')).toBe(
      'https://dashboard.stripe.com/invoices/in_1Abc',
    );
    expect(getStripeInvoiceDashboardUrl(false, 'in_1Abc')).toBe(
      'https://dashboard.stripe.com/test/invoices/in_1Abc',
    );
  });

  it('is none when the mode is not known: a link to the wrong one finds nothing', () => {
    expect(getStripeInvoiceDashboardUrl(undefined, 'in_1Abc')).toBeUndefined();
    expect(getStripeInvoiceDashboardUrl(null, 'in_1Abc')).toBeUndefined();
  });

  it('is none for an identifier that is not an invoice’s, which is not put in an address', () => {
    expect(getStripeInvoiceDashboardUrl(true, undefined)).toBeUndefined();
    expect(getStripeInvoiceDashboardUrl(true, '')).toBeUndefined();
    expect(getStripeInvoiceDashboardUrl(true, 'cus_1')).toBeUndefined();
    expect(getStripeInvoiceDashboardUrl(true, 'in_1/../../x')).toBeUndefined();
    expect(getStripeInvoiceDashboardUrl(true, 'in_1?x=y')).toBeUndefined();
  });
});
