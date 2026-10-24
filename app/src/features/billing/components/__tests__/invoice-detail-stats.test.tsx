import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type { Invoice } from '@/api-client';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import {
  buildInvoice,
  buildInvoiceLine,
} from '../../../../../e2e/app/_support/fixtures/build-invoice';
import { InvoiceDetailStats } from '../invoice-detail/invoice-detail-stats';

useBillingTexts();

// Midday UTC on the 20th: the invoices below fall due around it.
const NOW = Date.parse('2027-03-20T12:00:00.000Z');
const BOUNDARY = '2027-03-01T00:00:00.000Z';
const NEXT = '2027-04-01T00:00:00.000Z';

const line = (seq: number, amount: number) =>
  buildInvoiceLine({
    amount,
    description: `1 × $${amount / 100} per month`,
    invoiceId: 'inv-1',
    label: `Line ${seq}`,
    seq,
    serviceFrom: BOUNDARY,
    serviceTo: NEXT,
    type: 'BASE',
  });

const invoice = (overrides: Partial<Parameters<typeof buildInvoice>[0]> = {}) =>
  buildInvoice({
    boundaryAt: BOUNDARY,
    id: 'inv-1',
    issuedAt: '2027-03-17T00:04:00.000Z',
    lines: [line(1, 12900)],
    ...overrides,
  });

const renderStats = (value: Invoice) =>
  render(<InvoiceDetailStats invoice={value} now={NOW} />);

/** The card of the strip with this label. */
const card = (label: string) => {
  const found = screen
    .getByText(label)
    .closest<HTMLElement>('[data-slot="stat-card"]');
  if (!found) {
    throw new Error(`No card is labelled ${label}`);
  }

  return found;
};

const helpers = (element: HTMLElement) =>
  element.querySelectorAll('[data-slot="stat-card-helper"]');

const valueOf = (element: HTMLElement) =>
  element.querySelector<HTMLElement>('[data-slot="stat-card-value"]') as HTMLElement;

/** The zone of a date or a period: a caption after it, not a part of the figure. */
const unitOf = (element: HTMLElement) =>
  element.querySelector<HTMLElement>('[data-slot="stat-card-unit"]');

describe('the figures under the header of an invoice', () => {
  it('are three cards in a row of three from lg: the total, the due date and the service period', () => {
    const { container } = renderStats(invoice());

    expect(container.querySelectorAll('[data-slot="stat-card"]')).toHaveLength(3);
    expect(container.querySelector('[data-slot="stat-card-row"]')).toHaveClass(
      'lg:grid-cols-3',
    );
    expect(
      [...container.querySelectorAll('[data-slot="stat-card-label"]')].map(
        (label) => label.textContent,
      ),
    ).toEqual(['Total', 'Due', 'Service period']);
  });

  describe('the total', () => {
    it('is the total of the invoice as the API states it, and how many lines it comes from', () => {
      renderStats(
        invoice({
          discountTotal: 0,
          lines: [line(1, 12900), line(2, 500)],
          subtotal: 13400,
          total: 13300,
        }),
      );

      const total = card('Total');
      expect(total).toHaveTextContent('$133.00');
      expect(within(total).getByText('2 lines')).toBeInTheDocument();
    });

    it('never works a total out of the lines: a total that disagrees with them is shown as it is', () => {
      renderStats(invoice({ lines: [line(1, 12900)], total: 4300 }));

      expect(card('Total')).toHaveTextContent('$43.00');
      expect(screen.queryByText('$129.00')).toBeNull();
    });

    it('counts one line in the singular', () => {
      renderStats(invoice());

      expect(within(card('Total')).getByText('1 line')).toBeInTheDocument();
    });
  });

  describe('the due date', () => {
    it('is the day the invoice falls due, in UTC, and how many days away it is', () => {
      renderStats(invoice({ dueAt: '2027-03-31T00:04:00.000Z' }));

      const due = card('Due');
      expect(valueOf(due)).toHaveTextContent('Mar 31, 2027');
      expect(unitOf(due)).toHaveTextContent('(UTC)');
      expect(within(due).getByText('in 11 days')).toBeInTheDocument();
      expect(due.querySelector('[data-slot="stat-card-value"]')).not.toHaveClass(
        'text-destructive-subtle-foreground',
      );
    });

    it.each([
      ['2027-03-20T23:00:00.000Z', 'today'],
      ['2027-03-21T09:00:00.000Z', 'tomorrow'],
    ])('says an invoice due at %s is due %s', (dueAt, words) => {
      renderStats(invoice({ dueAt }));

      expect(within(card('Due')).getByText(words)).toBeInTheDocument();
    });

    it('says in danger how long an unpaid invoice has been overdue', () => {
      renderStats(invoice({ dueAt: '2027-03-10T00:04:00.000Z' }));

      const due = card('Due');
      const helper = within(due).getByText('overdue for 10 days');
      expect(helper).toHaveClass('text-destructive-subtle-foreground');
      expect(due.querySelector('[data-slot="stat-card-value"]')).toHaveClass(
        'text-destructive-subtle-foreground',
      );
    });

    it('says an invoice overdue for a single day, in the singular', () => {
      renderStats(invoice({ dueAt: '2027-03-19T00:04:00.000Z' }));

      expect(
        within(card('Due')).getByText('overdue for 1 day'),
      ).toBeInTheDocument();
    });

    it('says an invoice that fell due earlier today is overdue since today', () => {
      renderStats(invoice({ dueAt: '2027-03-20T00:04:00.000Z' }));

      expect(
        within(card('Due')).getByText('overdue since today'),
      ).toBeInTheDocument();
    });

    it('does not call overdue what the status badge does not: a card charged on its own', () => {
      renderStats(
        invoice({
          collectionMethod: 'CHARGE_AUTOMATICALLY',
          dueAt: '2027-03-10T00:04:00.000Z',
        }),
      );

      const due = card('Due');
      expect(within(due).getByText('10 days ago')).toBeInTheDocument();
      expect(within(due).queryByText(/overdue/)).toBeNull();
    });

    it.each([
      ['a draft', { issuedAt: null, status: 'DRAFT' as const }],
      [
        'a held draft',
        {
          holdReason: 'LEDGER_SEQUENCE_GAP' as const,
          issuedAt: null,
          status: 'DRAFT' as const,
        },
      ],
    ])('says %s was not issued, as a word that is not a figure, and has no helper', (_, overrides) => {
      renderStats(invoice(overrides));

      const due = card('Due');
      const word = within(due).getByText('Not issued');
      // A badge, so that it does not pass for a figure in the numeral type.
      expect(word).toHaveClass('rounded-md', 'border');
      expect(word.closest('[data-slot="stat-card-value"]')).not.toBeNull();
      expect(helpers(due)).toHaveLength(0);
    });

    it('says an issued invoice that has no due date has none', () => {
      renderStats(invoice({ dueAt: 'soon' }));

      expect(within(card('Due')).getByText('No due date')).toBeInTheDocument();
    });
  });

  describe('an invoice that ended', () => {
    it.each([
      [
        'paid',
        { paidAt: '2027-03-18T10:30:00.000Z', status: 'PAID' as const },
        'Paid',
        'Mar 18, 2027',
        '10:30 AM (UTC)',
      ],
      [
        'written off',
        {
          status: 'UNCOLLECTIBLE' as const,
          uncollectibleAt: '2027-03-19T09:00:00.000Z',
        },
        'Written off',
        'Mar 19, 2027',
        '9:00 AM (UTC)',
      ],
      [
        'voided',
        { status: 'VOID' as const, voidedAt: '2027-03-12T08:30:00.000Z' },
        'Voided',
        'Mar 12, 2027',
        '8:30 AM (UTC)',
      ],
    ])(
      'is no longer due: when it was %s takes the place of a due date, with the time of day under it',
      (_, overrides, label, day, time) => {
        renderStats(invoice({ dueAt: '2027-03-10T00:04:00.000Z', ...overrides }));

        const ended = card(label);
        expect(valueOf(ended)).toHaveTextContent(day);
        expect(unitOf(ended)).toHaveTextContent('(UTC)');
        expect(within(ended).getByText(time)).toBeInTheDocument();
        expect(screen.queryByText('Due')).toBeNull();
        expect(screen.queryByText(/overdue/)).toBeNull();
      },
    );

    it('is not called overdue, however long ago it fell due', () => {
      renderStats(
        invoice({
          dueAt: '2027-01-10T00:04:00.000Z',
          paidAt: '2027-03-18T10:30:00.000Z',
          status: 'PAID',
        }),
      );

      expect(
        card('Paid').querySelector('[data-slot="stat-card-value"]'),
      ).not.toHaveClass('text-destructive-subtle-foreground');
    });

    it('shows the placeholder where the API did not say when', () => {
      renderStats(invoice({ status: 'PAID' }));

      expect(valueOf(card('Paid'))).toHaveTextContent('—');
      expect(unitOf(card('Paid'))).toBeNull();
      expect(helpers(card('Paid'))).toHaveLength(0);
    });
  });

  describe('the service period', () => {
    it('is the span the lines bill, in UTC, under the kind of invoice it is', () => {
      renderStats(invoice({ kind: 'RENEWAL' }));

      const period = card('Service period');
      expect(valueOf(period)).toHaveTextContent('Mar 1 – Apr 1, 2027');
      expect(unitOf(period)).toHaveTextContent('(UTC)');
      expect(within(period).getByText('Renewal')).toBeInTheDocument();
    });

    it.each([
      ['ACTIVATION' as const, 'Activation'],
      ['FINAL' as const, 'Final'],
    ])('says an invoice of the kind %s is one', (kind, words) => {
      renderStats(invoice({ kind }));

      expect(
        within(card('Service period')).getByText(words),
      ).toBeInTheDocument();
    });

    it('is set one size below the other figures, which are one amount or one date', () => {
      renderStats(invoice());

      expect(valueOf(card('Service period'))).toHaveClass(
        'text-xl',
        'md:text-2xl',
      );
      expect(valueOf(card('Total'))).not.toHaveClass('text-xl');
      expect(valueOf(card('Due'))).not.toHaveClass('text-xl');
    });

    it('wraps after its dash, each date whole and the zone with the last one', () => {
      renderStats(invoice());

      const pieces = [
        ...valueOf(card('Service period')).querySelectorAll('.inline-block'),
      ].map((piece) => piece.textContent?.replace(/\s+/g, ' '));
      expect(pieces).toEqual(['Mar 1 –', 'Apr 1, 2027 (UTC)']);
      // A single date is one piece, and wraps as a sentence does.
      expect(valueOf(card('Due')).querySelector('.inline-block')).toBeNull();
    });

    it('takes both columns of the strip below lg, where a period is too long for half of one', () => {
      renderStats(invoice());

      expect(card('Service period')).toHaveClass('col-span-2', 'lg:col-span-1');
      expect(card('Total')).not.toHaveClass('col-span-2');
      expect(card('Due')).not.toHaveClass('col-span-2');
    });
  });

  it('are read in French', async () => {
    await testI18n.changeLanguage('fr');
    try {
      renderStats(
        invoice({
          dueAt: '2027-03-10T00:04:00.000Z',
          lines: [line(1, 12900), line(2, 500)],
          subtotal: 13400,
          total: 13400,
        }),
      );

      expect(card('Total')).toHaveTextContent('2 lignes');
      expect(card('Échéance de paiement')).toHaveTextContent(
        'en retard de 10 jours',
      );
      expect(card('Période de service')).toHaveTextContent('Renouvellement');
    } finally {
      await testI18n.changeLanguage('en');
    }
  });
});
