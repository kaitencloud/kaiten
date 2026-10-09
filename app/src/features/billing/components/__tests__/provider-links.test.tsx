import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import { ProviderLinks } from '../invoice-detail/provider-links';

useBillingTexts();

const HOSTED = 'https://invoice.stripe.com/i/acct_1/test_1';
const PDF = 'https://pay.stripe.com/invoice/acct_1/test_1/pdf';

// The pages Stripe hosts for an invoice leave the console: the invoice a customer pays on, and
// its PDF. They are links a person follows to a site that is not Kaiten, so they are read from
// the API each time, open in a tab with no way back to the console, and are only ever https.

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('the pages Stripe hosts for an invoice', () => {
  it('are links that open a tab of their own with no access to the console', () => {
    render(<ProviderLinks provider={{ hostedInvoiceUrl: HOSTED, invoicePdfUrl: PDF }} />);

    for (const [name, href] of [
      ['Hosted invoice', HOSTED],
      ['PDF', PDF],
    ] as const) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('are kept in no storage of the browser', () => {
    render(<ProviderLinks provider={{ hostedInvoiceUrl: HOSTED, invoicePdfUrl: PDF }} />);

    const stored = JSON.stringify([
      ...Object.entries(window.localStorage),
      ...Object.entries(window.sessionStorage),
    ]);
    expect(stored).not.toContain('stripe.com');
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
  });

  it('are said to no console', () => {
    const consoles = (['debug', 'error', 'info', 'log', 'warn'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );

    render(<ProviderLinks provider={{ hostedInvoiceUrl: HOSTED, invoicePdfUrl: PDF }} />);

    for (const spy of consoles) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain('stripe.com');
    }
  });

  it('are what the API says now: another address replaces the one that was shown', () => {
    const { rerender } = render(
      <ProviderLinks provider={{ hostedInvoiceUrl: HOSTED }} />,
    );
    expect(screen.getByRole('link', { name: 'Hosted invoice' })).toHaveAttribute(
      'href',
      HOSTED,
    );

    rerender(
      <ProviderLinks
        provider={{ hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_1/test_2' }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Hosted invoice' })).toHaveAttribute(
      'href',
      'https://invoice.stripe.com/i/acct_1/test_2',
    );
  });

  it.each([
    ['javascript:alert(1)'],
    ['http://invoice.stripe.com/i/acct_1/test_1'],
    ['data:text/html,<script>alert(1)</script>'],
    ['//invoice.stripe.com/i/acct_1/test_1'],
    ['/billing/invoices'],
  ])('are no link at all when the address is %s', (address) => {
    render(<ProviderLinks provider={{ hostedInvoiceUrl: address, invoicePdfUrl: address }} />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByTestId('invoice-provider-links')).toBeNull();
    expect(document.querySelector('a')).toBeNull();
  });

  it('are shown one by one: the one that is safe stays when the other is not', () => {
    render(
      <ProviderLinks
        provider={{ hostedInvoiceUrl: 'javascript:alert(1)', invoicePdfUrl: PDF }}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Hosted invoice' })).toBeNull();
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', PDF);
  });

  it('are no row at all for a draft Stripe has not finalized, which has neither', () => {
    render(<ProviderLinks provider={{}} />);

    expect(screen.queryByTestId('invoice-provider-links')).toBeNull();
  });
});
