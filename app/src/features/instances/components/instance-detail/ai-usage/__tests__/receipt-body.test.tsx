import { fireEvent, render, screen, within } from '@testing-library/react';
import i18n from 'i18next';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import { ReceiptBody, ReceiptHeadline } from '../receipt/receipt-body';
import type { ReceiptView } from '../receipt/receipt-view';
import { older, ruleOf, snapshotOf, viewOf } from './receipt-world';

beforeEach(() => {
  i18n.addResourceBundle('en', 'translation', en, true, true);
  void i18n.changeLanguage('en');
});

function renderReceipt(view: ReceiptView) {
  return render(
    <>
      <ReceiptHeadline view={view} />
      <ReceiptBody view={view} />
    </>,
  );
}

function section(name: string) {
  return screen.getByRole('region', { name });
}

describe('charge receipt', () => {
  it('003: shows the recomputed lines, the charge and the effect on the pool', () => {
    renderReceipt(viewOf(older(3), { creditValue: '0.01' }));
    const priced = section(en.AI.Receipt.sections.priced);

    expect(within(priced).getByText(en.AI.Receipt.priced.matches)).toBeInTheDocument();
    expect(within(priced).getByText('0.496')).toBeInTheDocument();
    expect(within(priced).getByText('0.124')).toBeInTheDocument();
    expect(within(priced).getByText('0.76')).toBeInTheDocument();
    expect(within(priced).getByText('1.38 credits')).toBeInTheDocument();
    expect(within(section(en.AI.Receipt.sections.pool)).getByText('0.77')).toBeInTheDocument();
    expect(within(section(en.AI.Receipt.sections.cost)).getByText(/Margin at/)).toBeInTheDocument();
  });

  it('shows no raw JSON until the disclosure is opened', () => {
    const { container } = renderReceipt(viewOf(older(3)));
    const toggle = screen.getByRole('button', { name: en.AI.Receipt.raw.show });

    expect(container.querySelector('pre')).toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(container.querySelector('pre')).toHaveTextContent('"transactionId": "txn_acme_003"');
  });

  it('016: says the charge was raised to the minimum', () => {
    renderReceipt(viewOf(older(16)));

    expect(screen.getByText('raised to 0.50')).toBeInTheDocument();
    expect(screen.getByText('0.50 credits')).toBeInTheDocument();
  });

  it('007: shows the error policy that left the call uncharged', () => {
    renderReceipt(viewOf(older(7)));

    expect(screen.getByText('Charge on error: Never')).toBeInTheDocument();
    expect(screen.getAllByText('not charged').length).toBeGreaterThan(0);
    expect(screen.getByText('0.00 credits')).toBeInTheDocument();
  });

  it.each([11, 8, 9])('%s: explains a refusal and prints no arithmetic', (n) => {
    renderReceipt(viewOf(older(n)));

    expect(section(en.AI.Receipt.sections.notCharged)).toHaveTextContent(en.AI.Receipt.denial.recorded);
    expect(screen.queryByRole('region', { name: en.AI.Receipt.sections.priced })).toBeNull();
    expect(screen.getByText(en.AI.Receipt.pool.nothingHeld)).toBeInTheDocument();
  });

  it('012: explains an expired reservation', () => {
    renderReceipt(viewOf(older(12)));

    expect(section(en.AI.Receipt.sections.happened)).toHaveTextContent('2.40 credits');
    expect(screen.getByText(en.AI.Receipt.pool.givenBack.EXPIRED)).toBeInTheDocument();
  });

  it('shows the stored facts only, and why, when the rule was edited after the commit', () => {
    const row = older(3);
    const rule = { ...ruleOf(row)!, updatedAt: '2026-11-11T09:39:00.000Z' };
    renderReceipt(viewOf(row, { rule }));
    const priced = section(en.AI.Receipt.sections.priced);

    expect(priced).toHaveTextContent(en.AI.Receipt.priced.cannot.intro);
    expect(priced).toHaveTextContent(/edited on .* after this commit/);
    expect(within(priced).queryByText('0.496')).toBeNull();
    expect(within(priced).getByText('1.38 credits')).toBeInTheDocument();
  });

  it('reads a row with a pricing snapshot as the rates applied at commit', () => {
    const row = older(3);
    const rule = ruleOf(row)!;
    const view = viewOf(
      {
        ...row,
        pricing: snapshotOf(rule),
      },
      { rule: { ...rule, minimumCreditsPerRequest: '1' } },
    );
    renderReceipt(view);
    const priced = section(en.AI.Receipt.sections.priced);

    expect(view.pricing?.kind).toBe('SNAPSHOT');
    expect(priced).toHaveTextContent(en.AI.Receipt.priced.editedSinceHelp);
    expect(within(priced).getByText('0.496')).toBeInTheDocument();
    expect(screen.getAllByText(en.AI.Receipt.priced.editedSince).length).toBeGreaterThan(0);
  });

  it('a snapshot that cannot be recomputed shows its rates and bounds, and claims neither "within" nor "not charged"', () => {
    const row = older(7);
    const rule = ruleOf(row)!;
    // A provider error whose status the row lost: nothing can be recomputed.
    const { requestStatus: _status, ...statusless } = row;
    const view = viewOf({ ...statusless, pricing: snapshotOf(rule) });
    renderReceipt(view);
    const priced = section(en.AI.Receipt.sections.priced);

    expect(view.pricing).toMatchObject({ kind: 'SNAPSHOT', price: { ok: false } });
    expect(priced).toHaveTextContent(/Minimum .* maximum/);
    expect(within(priced).queryByText(en.AI.Receipt.priced.within)).toBeNull();
    expect(within(priced).queryByText(en.AI.Receipt.priced.notChargedOutcome)).toBeNull();
    expect(within(priced).queryByText(en.AI.Receipt.priced.chargedOutcome)).toBeNull();
    expect(within(priced).getByText('0.00 credits')).toBeInTheDocument();
  });

  it('an archived rule is said archived, with no "now" value beside its rates', () => {
    const row = older(3);
    const rule = ruleOf(row)!;
    const view = viewOf(
      { ...row, pricing: snapshotOf(rule) },
      { rule: { ...rule, status: 'ARCHIVED', rates: { perInputToken: '9' } } },
    );
    renderReceipt(view);
    const priced = section(en.AI.Receipt.sections.priced);

    expect(priced).toHaveTextContent(en.AI.Receipt.priced.archivedSinceHelp);
    expect(priced).not.toHaveTextContent('now ');
    expect(screen.getAllByText(en.AI.Receipt.priced.archivedSince).length).toBe(2);
  });
});
