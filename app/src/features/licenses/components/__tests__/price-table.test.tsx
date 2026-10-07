import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type { License, Price } from '@/api-client';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import {
  buildEntitlement,
  buildGrant,
  buildLicense,
  buildPrice,
} from '../../../../../e2e/app/_support/fixtures';
import { getPriceRules } from '../../utils/license-price.utils';
import { PriceTable } from '../prices/price-table';

// A link is only an anchor here: where it leads is what the tests read.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search,
    to,
    ...props
  }: {
    children: ReactNode;
    params: { licenseSlug: string };
    search: { price: string };
    to: string;
  }) => (
    <a
      {...props}
      href={`${to.replace('$licenseSlug', params.licenseSlug)}?price=${search.price}`}
    >
      {children}
    </a>
  ),
}));

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

type RenderOptions = {
  onDeprecate?: (price: Price) => void;
  prices?: Price[];
  /** `null`: the token says nothing of scopes, so every action is offered. */
  scopes?: string[] | null;
  state?: NonNullable<License['lifecycleState']>;
};

const renderTable = ({
  onDeprecate = () => undefined,
  prices = PRICES,
  scopes = null,
  state = 'PUBLISHED',
}: RenderOptions = {}) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(grantedScopesQueryKey, scopes);

  return render(
    <QueryClientProvider client={queryClient}>
      <PriceTable
        entitlementBySlug={new Map([['traces', traces]])}
        grantBySlug={
          new Map([
            [
              'traces',
              buildGrant({
                entitlement: traces,
                license,
                overagePercent: 100,
                value: 100_000,
              }),
            ],
          ])
        }
        licenseSlug="pro-v2"
        onDeprecate={onDeprecate}
        prices={prices}
        rules={getPriceRules({ lifecycleState: state })}
      />
    </QueryClientProvider>,
  );
};

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

  it('sets a deprecated price aside by muted text, never by an opacity that takes it under the contrast floor', () => {
    renderTable();

    expect(rowOf('Pro, annual')).toHaveClass('text-muted-foreground');
    expect(rowOf('Pro, annual').className).not.toMatch(/opacity/);
    expect(rowOf('Pro, monthly')).not.toHaveClass('text-muted-foreground');
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
    renderTable({ prices: [] });

    expect(screen.getByText('This version has no price yet.')).toBeInTheDocument();
  });

  describe('actions', () => {
    it('offers to deprecate an active price of a published version, and nothing else', () => {
      renderTable();

      const row = within(rowOf('Pro, monthly'));
      expect(
        row.getByRole('button', { name: 'Deprecate Pro, monthly' }),
      ).toBeInTheDocument();
      expect(row.queryByRole('link', { name: /Edit/ })).toBeNull();
    });

    it('offers no action on a deprecated price', () => {
      renderTable();

      const row = within(rowOf('Pro, annual'));
      expect(row.queryByRole('button')).toBeNull();
      expect(row.queryByRole('link')).toBeNull();
    });

    it('lets the price of a draft be edited, by a link the drawer opens from', () => {
      renderTable({ state: 'DRAFT' });

      const link = within(rowOf('Pro, monthly')).getByRole('link', {
        name: 'Edit Pro, monthly',
      });
      expect(link).toHaveAttribute('href', '/licenses/pro-v2/prices?price=p-base');
    });

    it('offers neither edit nor deprecation on an archived version, but the deprecation of an active price', () => {
      renderTable({ state: 'ARCHIVED' });

      const row = within(rowOf('Traces, overage'));
      expect(row.queryByRole('link')).toBeNull();
      expect(
        row.getByRole('button', { name: 'Deprecate Traces, overage' }),
      ).toBeInTheDocument();
    });

    it('hands the price to deprecate to the page', async () => {
      const onDeprecate = vi.fn();
      renderTable({ onDeprecate });

      await userEvent.click(
        screen.getByRole('button', { name: 'Deprecate Traces, overage' }),
      );

      expect(onDeprecate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p-over' }),
      );
    });

    it('shows no action to a session that may only read licenses', () => {
      renderTable({ scopes: ['read:licenses'], state: 'DRAFT' });

      expect(screen.queryByRole('button', { name: /Deprecate/ })).toBeNull();
      expect(screen.queryByRole('link', { name: /Edit/ })).toBeNull();
    });
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
