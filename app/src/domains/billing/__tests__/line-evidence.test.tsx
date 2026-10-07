import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type { InvoiceLineLedger, InvoiceLineOverage } from '@/api-client';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { LineFingerprint, OverageLimits } from '../components';

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

const ledger = (overrides: Partial<InvoiceLineLedger> = {}): InvoiceLineLedger => ({
  firstSeq: 41,
  lastSeq: 45,
  rows: 5,
  sumDelta: '172345',
  sumOverage: null,
  ...overrides,
});

describe('LineFingerprint', () => {
  it('names the reports a line was measured from, how many there are and what they sum to', () => {
    render(<LineFingerprint ledger={ledger()} />);

    expect(screen.getByTestId('line-fingerprint')).toHaveTextContent(
      'Reports 41–45 · 5 rows · Σ 172,345',
    );
  });

  it('writes a single report as one, not as a range', () => {
    render(
      <LineFingerprint
        ledger={ledger({ firstSeq: 7, lastSeq: 7, rows: 1, sumDelta: '12' })}
      />,
    );

    expect(screen.getByTestId('line-fingerprint')).toHaveTextContent(
      'Report 7 · 1 row · Σ 12',
    );
  });

  it('keeps every digit of a sum beyond what a float holds', () => {
    render(
      <LineFingerprint ledger={ledger({ sumDelta: '9007199254740993' })} />,
    );

    expect(screen.getByTestId('line-fingerprint')).toHaveTextContent(
      'Σ 9,007,199,254,740,993',
    );
  });

  it('keeps the decimals of a sum', () => {
    render(<LineFingerprint ledger={ledger({ sumDelta: '0.52345' })} />);

    expect(screen.getByTestId('line-fingerprint')).toHaveTextContent('Σ 0.52345');
  });

  it('says a period had no report', () => {
    render(
      <LineFingerprint
        ledger={ledger({ firstSeq: null, lastSeq: null, rows: 0, sumDelta: '0' })}
      />,
    );

    expect(screen.getByTestId('line-fingerprint')).toHaveTextContent(
      'No usage reports in this period.',
    );
  });

  it('reads in French, with the grouping of the language', async () => {
    await testI18n.changeLanguage('fr');
    try {
      render(<LineFingerprint ledger={ledger()} />);

      expect(screen.getByTestId('line-fingerprint').textContent).toMatch(
        /^Rapports 41–45 · 5 lignes · Σ 172\s345$/,
      );
    } finally {
      await testI18n.changeLanguage('en');
    }
  });
});

const overage = (
  overrides: Partial<InvoiceLineOverage> = {},
): InvoiceLineOverage => ({
  limits: [{ limitValue: '100000', overagePercent: 50, rows: 5 }],
  overageMeasured: '4200',
  usageMeasured: '104200',
  ...overrides,
});

describe('OverageLimits', () => {
  it('shows what was measured and how much of it was above the limit', () => {
    render(<OverageLimits overage={overage()} />);

    expect(screen.getByTestId('overage-limits')).toHaveTextContent(
      'Usage 104,200, of which 4,200 above the limit',
    );
  });

  it('lists the limit that applied, with what is accepted above it and the reports it measured', () => {
    render(<OverageLimits overage={overage()} />);

    expect(screen.getByRole('list', { name: 'Limits applied' })).toHaveTextContent(
      'Limit 100,000 (+50% accepted) · 5 reports',
    );
  });

  it('lists every limit when it changed during the period, in the order they applied', () => {
    render(
      <OverageLimits
        overage={overage({
          limits: [
            { limitValue: '100000', overagePercent: 0, rows: 3 },
            { limitValue: '150000', overagePercent: 10, rows: 1 },
          ],
        })}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Limit 100,000');
    expect(items[1]).toHaveTextContent('Limit 150,000');
  });

  it('says a meter had no limit', () => {
    render(
      <OverageLimits
        overage={overage({
          limits: [{ limitValue: null, overagePercent: 0, rows: 2 }],
        })}
      />,
    );

    expect(screen.getByRole('listitem')).toHaveTextContent('No limit');
  });

  it('counts no reports for a sample, which has none', () => {
    render(
      <OverageLimits
        overage={overage({
          limits: [{ limitValue: '100', overagePercent: 0, rows: 0 }],
        })}
      />,
    );

    expect(screen.getByRole('listitem')).not.toHaveTextContent('report');
  });
});
