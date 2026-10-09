import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import type { InvoiceLine, InvoiceSummary } from '@/api-client';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import { buildInvoiceLine } from '../../../../e2e/app/_support/fixtures/build-invoice';
import { InvoiceLinesTable, InvoiceTotalCell } from '../components';

useBillingTexts();

const PERIOD = {
  serviceFrom: '2026-10-01T00:00:00.000Z',
  serviceTo: '2026-11-01T00:00:00.000Z',
};
const BASE = buildInvoiceLine({
  ...PERIOD,
  amount: 4_800_000,
  description: '1 × $48,000.00',
  invoiceId: 'inv-1',
  label: 'Enterprise, annual',
  seq: 1,
  type: 'BASE',
});
const ADDON = buildInvoiceLine({
  ...PERIOD,
  amount: 120_000,
  description: '2 × $600.00',
  invoiceId: 'inv-1',
  label: 'Extra seats',
  seq: 2,
  type: 'ADDON',
});

const discountLine = (
  overrides: Partial<NonNullable<InvoiceLine['discount']>> = {},
  line: Partial<InvoiceLine> = {},
): InvoiceLine =>
  buildInvoiceLine({
    ...PERIOD,
    amount: -480_000,
    // The label and the arithmetic are prose: the console reads the members of `discount`.
    description: 'prose that says 99% of 1',
    discount: {
      allocations: [{ amount: 480_000, targetSeq: 1 }],
      application: 1,
      applicationsMax: 2,
      appliesTo: 'LICENSE_BASE',
      base: '4800000',
      discountType: 'PERCENTAGE',
      discountValue: '10',
      targetSeqs: [1],
      ...overrides,
    },
    invoiceId: 'inv-1',
    label: 'Acme enterprise agreement',
    seq: 3,
    type: 'DISCOUNT',
    ...line,
  });

const renderLines = (lines: InvoiceLine[]) =>
  render(<InvoiceLinesTable currency="USD" lines={lines} />);

describe('a discount line of an invoice', () => {
  it('says what it takes of what its targets amounted to, which invoice of its redemption it is, and what each target bears', () => {
    renderLines([BASE, ADDON, discountLine()]);

    const detail = screen.getByTestId('invoice-line-discount');
    expect(detail).toHaveTextContent('10% of $48,000.00');
    expect(detail).toHaveTextContent('Invoice 1 of 2 for this redemption');
    expect(detail).toHaveTextContent('Bears on Enterprise, annual ($4,800.00)');
  });

  it('reads the percentage from the members of the line, never from its label or its arithmetic', () => {
    renderLines([
      BASE,
      discountLine({ discountValue: '25' }, { label: 'Ten percent off' }),
    ]);

    expect(screen.getByTestId('invoice-line-discount')).toHaveTextContent(
      '25% of $48,000.00',
    );
  });

  it('writes an amount off in the currency it was given in', () => {
    renderLines([
      BASE,
      discountLine({
        allocations: [{ amount: 5_000, targetSeq: 1 }],
        base: '4800000',
        currency: 'USD',
        discountType: 'FIXED_AMOUNT',
        discountValue: '5000',
      }),
    ]);

    expect(screen.getByTestId('invoice-line-discount')).toHaveTextContent(
      '$50.00 off $48,000.00',
    );
  });

  it('says the redemption has no end when it has no maximum', () => {
    renderLines([
      BASE,
      discountLine({ application: 7, applicationsMax: undefined }),
    ]);

    expect(screen.getByTestId('invoice-line-discount')).toHaveTextContent(
      'Invoice 7 for this redemption',
    );
    expect(screen.getByTestId('invoice-line-discount')).not.toHaveTextContent(
      'Invoice 7 of',
    );
  });

  it('lists every target with what it bears, and names a line the invoice no longer holds by its number', () => {
    renderLines([
      BASE,
      ADDON,
      discountLine({
        allocations: [
          { amount: 400_000, targetSeq: 1 },
          { amount: 80_000, targetSeq: 2 },
          { amount: 1_000, targetSeq: 9 },
        ],
        appliesTo: 'BOTH',
        targetSeqs: [1, 2, 9],
      }),
    ]);

    expect(screen.getByTestId('invoice-line-discount')).toHaveTextContent(
      'Bears on Enterprise, annual ($4,000.00), Extra seats ($800.00), and Line 9 ($10.00)',
    );
  });

  it('is shown on a discount only, and its amount stays the amount of the line, negative', () => {
    renderLines([BASE, discountLine()]);

    expect(screen.getAllByTestId('invoice-line-discount')).toHaveLength(1);
    const row = screen.getByRole('row', { name: /Acme enterprise agreement/ });
    // Written as a negative: the sign is the minus of the language, not a hyphen to match.
    expect(within(row).getByText(/^[-−]\$4,800\.00$/)).toBeInTheDocument();
  });

  it('says nothing for a discount line that carries no detail', () => {
    renderLines([BASE, discountLine({}, { discount: undefined })]);

    expect(screen.queryByTestId('invoice-line-discount')).not.toBeInTheDocument();
  });
});

describe('what the discounts took off an invoice', () => {
  const summary = (
    overrides: Partial<InvoiceSummary> = {},
  ): Pick<InvoiceSummary, 'currency' | 'discountTotal' | 'total'> => ({
    currency: 'USD',
    discountTotal: 0,
    total: 4_440_000,
    ...overrides,
  });

  it('says how much in the cell of the total, from the sum the API states', () => {
    render(<InvoiceTotalCell invoice={summary({ discountTotal: 480_000 })} />);

    expect(screen.getByText('$44,400.00')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-discount-total')).toHaveTextContent(
      'After $4,800.00 of discounts',
    );
  });

  it('says nothing of discounts when there were none', () => {
    render(<InvoiceTotalCell invoice={summary()} />);

    expect(screen.getByText('$44,400.00')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-discount-total')).not.toBeInTheDocument();
  });
});
