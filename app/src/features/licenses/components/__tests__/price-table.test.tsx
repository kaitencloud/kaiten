import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import {
  buildEntitlement,
  buildGrant,
  buildLicense,
  buildPrice,
} from '../../../../../e2e/app/_support/fixtures';
import { PriceTable } from '../prices/price-table';

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
});

const traces = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Traces',
  resetPeriod: 'MONTH',
  saleUnit: { factor: 100_000, label: '100,000 traces' },
  slug: 'traces',
  unit: { plural: 'traces', singular: 'trace' },
});
const license = buildLicense({
  description: 'Pro',
  id: 'license-pro',
  name: 'Pro',
  slug: 'pro-v2',
  type: 'PAID',
});

const PRICES = [
  buildPrice({
    displayLabel: 'Pro, monthly',
    displayOrder: 1,
    id: 'p-base',
    isDefault: true,
    unitAmountDecimal: '2900',
  }),
  buildPrice({
    billingPeriod: 'ANNUAL',
    deprecatedAt: '2026-02-20T09:00:00.000Z',
    displayLabel: 'Pro, annual',
    displayOrder: 1,
    id: 'p-old',
    status: 'DEPRECATED',
    unitAmountDecimal: '29000',
  }),
  buildPrice({
    billingModel: 'OVERAGE',
    displayLabel: 'Traces, overage',
    displayOrder: 2,
    id: 'p-over',
    metered: {
      entitlementSlug: 'traces',
      saleUnitFactor: '100000',
      saleUnitSingular: '100,000 traces',
    },
    unitAmountDecimal: '800',
  }),
];

const renderTable = (prices = PRICES) =>
  render(
    <PriceTable
      entitlementBySlug={new Map([['traces', traces]])}
      grantBySlug={
        new Map([
          [
            'traces',
            buildGrant({ entitlement: traces, license, overagePercent: 100, value: 100_000 }),
          ],
        ])
      }
      prices={prices}
    />,
  );

const rowOf = (name: string) =>
  screen
    .getAllByRole('row')
    .find((row) => within(row).queryByText(name) !== null) as HTMLElement;

describe('PriceTable', () => {
  it('lists the prices in the order it is given, one row each', () => {
    renderTable();

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByText(/Pro|Traces/)[0].textContent)).toEqual([
      'Pro, monthly',
      'Pro, annual',
      'Traces, overage',
    ]);
  });

  it('shows the default flat fee with its period and amount', () => {
    renderTable();

    const row = within(rowOf('Pro, monthly'));
    expect(row.getByText('Default')).toBeInTheDocument();
    expect(row.getByText('Flat fee')).toBeInTheDocument();
    expect(row.getByText('$29.00')).toBeInTheDocument();
    expect(row.getByText('/month')).toBeInTheDocument();
    expect(row.getByText('Monthly · In advance')).toBeInTheDocument();
    expect(row.getByText('Active')).toBeInTheDocument();
  });

  it('shows a deprecated price with the day it was retired', () => {
    renderTable();

    const row = within(rowOf('Pro, annual'));
    expect(row.getByText('Deprecated')).toBeInTheDocument();
    expect(row.getByText('Deprecated Feb 20, 2026 (UTC)')).toBeInTheDocument();
    expect(row.queryByText('Default')).toBeNull();
  });

  it('shows an overage with its unit, its timing, and the allowance and cap it bills against', () => {
    renderTable();

    const row = within(rowOf('Traces, overage'));
    expect(row.getByText('Overage')).toBeInTheDocument();
    expect(row.getByText('$8.00')).toBeInTheDocument();
    expect(row.getByText('per 100,000 traces')).toBeInTheDocument();
    expect(row.getByText('In arrears')).toBeInTheDocument();
    expect(
      row.getByText('Bills above 100,000 traces/month, up to 200,000'),
    ).toBeInTheDocument();
  });

  it('says so when the version has no price', () => {
    renderTable([]);

    expect(screen.getByText('This version has no price yet.')).toBeInTheDocument();
  });

  it('reads in French', async () => {
    await testI18n.changeLanguage('fr');
    renderTable();

    const row = within(rowOf('Pro, monthly'));
    expect(row.getByText('Forfait')).toBeInTheDocument();
    expect(row.getByText('Par défaut')).toBeInTheDocument();
    expect(row.getByText('Mensuel · À l’avance')).toBeInTheDocument();
    expect(
      within(rowOf('Traces, overage')).getByText(
        'Facture au-delà de 100 000 traces/mois, jusqu’à 200 000',
      ),
    ).toBeInTheDocument();
    await testI18n.changeLanguage('en');
  });
});
