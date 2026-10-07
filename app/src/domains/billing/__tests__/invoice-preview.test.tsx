import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type { InvoiceLine, InvoicePreview } from '@/api-client';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import {
  InvoiceLinesTable,
  InvoicePreviewResult,
  InvoiceTotals,
} from '../components';
import { getInvoiceKindLabelKey, INVOICE_KINDS } from '../logic';

// The unit i18n returns a key for a text it was not given: these tests read the
// real English and French, as the user does.
beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

const PERIOD = {
  serviceFrom: '2027-03-01T00:00:00Z',
  serviceTo: '2027-04-01T00:00:00Z',
};

const line = (overrides: Partial<InvoiceLine> & Pick<InvoiceLine, 'seq'>) =>
  ({
    amount: 2900,
    description: '1 × 29.00 USD',
    label: 'Pro, base',
    quantity: '1',
    type: 'BASE',
    ...PERIOD,
    ...overrides,
  }) satisfies InvoiceLine;

describe('InvoiceLinesTable', () => {
  it('renders every type of line, with its period and its amount', () => {
    render(
      <InvoiceLinesTable
        currency="USD"
        lines={[
          line({ seq: 1 }),
          line({
            amount: 500,
            description: '1 × 5.00 USD',
            label: 'Extra seats',
            seq: 2,
            type: 'ADDON',
          }),
          line({
            amount: 840,
            description: '4.2 × 2.00 USD (per 1M tokens)',
            label: 'GPT-4 tokens',
            seq: 3,
            type: 'USAGE',
          }),
          line({
            amount: 579,
            description: '72,345 above the allowance (100,000)',
            label: 'Traces, overage',
            seq: 4,
            type: 'OVERAGE',
          }),
          line({
            amount: -580,
            description: 'LAUNCH −20%',
            label: 'LAUNCH',
            seq: 5,
            type: 'DISCOUNT',
          }),
        ]}
      />,
    );

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByText('Base')).toBeInTheDocument();
    expect(within(rows[0]).getByText('$29.00')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Mar 1 – Apr 1, 2027 (UTC)')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Add-on')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Usage')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Overage')).toBeInTheDocument();
    // The description is the API's own arithmetic, shown as written.
    expect(
      within(rows[3]).getByText('72,345 above the allowance (100,000)'),
    ).toBeInTheDocument();
    // A discount is a negative amount, with a true minus sign.
    expect(within(rows[4]).getByText('−$5.80')).toBeInTheDocument();
  });

  it('renders a line with no price members, and one of a type it does not know', () => {
    render(
      <InvoiceLinesTable
        currency="EUR"
        lines={[
          // The schema of a line is open: a discount has no unit amount, no
          // billing model and no license price.
          line({ amount: -100, label: 'Voucher', seq: 1, type: 'DISCOUNT' }),
          line({ seq: 2, type: 'CREDIT' as InvoiceLine['type'] }),
        ]}
      />,
    );

    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Discount')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Other')).toBeInTheDocument();
    expect(within(rows[1]).getByText('€29.00')).toBeInTheDocument();
  });

  it('marks a capped preview line and says why', () => {
    render(
      <InvoiceLinesTable
        currency="USD"
        lines={[line({ capped: true, seq: 1, type: 'USAGE' })]}
      />,
    );

    expect(screen.getByText('Capped')).toBeInTheDocument();
  });

  it('says so when there is nothing to bill', () => {
    render(<InvoiceLinesTable currency="USD" lines={[]} />);

    expect(screen.getByText('This invoice has no lines.')).toBeInTheDocument();
  });
});

describe('InvoiceTotals', () => {
  // The lines of this invoice add up to 4319 on purpose, and the API's total is
  // 4320: the console shows the API's.
  it('shows the totals as the API states them, never adding the lines up', () => {
    render(
      <InvoiceTotals
        currency="USD"
        discountTotal={580}
        subtotal={4900}
        total={4320}
      />,
    );

    const totals = screen.getByTestId('invoice-totals');
    expect(within(totals).getByText('$49.00')).toBeInTheDocument();
    expect(within(totals).getByText('−$5.80')).toBeInTheDocument();
    expect(within(totals).getByText('$43.20')).toBeInTheDocument();
    expect(screen.queryByText('$43.19')).toBeNull();
  });

  it('leaves the discounts out of an invoice that has none', () => {
    render(
      <InvoiceTotals currency="USD" discountTotal={0} subtotal={2900} total={2900} />,
    );

    expect(screen.queryByText('Discounts')).toBeNull();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('writes the amounts in the language of the app', async () => {
    await testI18n.changeLanguage('fr');
    render(
      <InvoiceTotals currency="EUR" discountTotal={0} subtotal={480000} total={480000} />,
    );

    expect(screen.getByText('Sous-total')).toBeInTheDocument();
    expect(screen.getAllByText(/4\s?800,00/).length).toBeGreaterThan(0);
    await testI18n.changeLanguage('en');
  });
});

describe('InvoicePreviewResult', () => {
  const preview: InvoicePreview = {
    asOf: '2027-03-01T10:00:00Z',
    boundaryAt: '2027-03-01T10:00:00Z',
    currency: 'USD',
    discountTotal: 0,
    kind: 'RENEWAL',
    licenseSlug: 'pro-v2',
    lines: [
      line({
        amount: 579,
        description: '0.72345 × 8.00 USD (per 100k traces)',
        label: 'Traces, overage',
        seq: 1,
        type: 'OVERAGE',
      }),
      line({ seq: 2 }),
    ],
    status: 'PREVIEW',
    subtotal: 3479,
    total: 3479,
    wouldHold: [],
  };

  it('shows the boundary it bills, its lines and its totals', () => {
    render(<InvoicePreviewResult preview={preview} />);

    const result = screen.getByRole('region', { name: 'Invoice preview' });
    expect(within(result).getByText(/Kind: Renewal\./)).toBeInTheDocument();
    expect(within(result).getByText('Traces, overage')).toBeInTheDocument();
    expect(within(result).getByText('Pro, base')).toBeInTheDocument();
    // The subtotal and the total are both the API's 3479.
    expect(
      within(screen.getByTestId('invoice-totals')).getAllByText('$34.79'),
    ).toHaveLength(2);
  });
});

describe('invoice kinds', () => {
  it('have a label for every boundary the API bills', () => {
    for (const kind of INVOICE_KINDS) {
      expect(getInvoiceKindLabelKey(kind)).toBe(
        `Features.Billing.InvoiceKind.${kind}`,
      );
    }
    expect([...INVOICE_KINDS].sort()).toEqual(['ACTIVATION', 'FINAL', 'RENEWAL']);
  });
});
