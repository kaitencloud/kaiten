import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import {
  buildEntitlement,
  buildPrice,
} from '../../../../../e2e/app/_support/fixtures';
import { PriceSummary } from '../prices/price-summary';

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

const requests = buildEntitlement({
  name: 'Requests',
  resetPeriod: 'DAY',
  saleUnit: { factor: 1_000, label: '1k requests' },
  slug: 'requests',
});
const traces = buildEntitlement({
  name: 'Traces',
  resetPeriod: 'MONTH',
  slug: 'traces',
  unit: { plural: 'traces', singular: 'trace' },
});
const entitlementBySlug = new Map([
  ['requests', requests],
  ['traces', traces],
]);

const base = buildPrice({
  id: 'base',
  isDefault: true,
  unitAmountDecimal: '2900',
});
const usage = buildPrice({
  billingModel: 'USAGE_BASED',
  id: 'usage',
  metered: {
    entitlementSlug: 'requests',
    saleUnitFactor: '1000',
    saleUnitSingular: '1k requests',
  },
  unitAmountDecimal: '150',
});

const summary = () => screen.getByTestId('price-summary').textContent;

describe('PriceSummary', () => {
  it('reads a flat fee for its period and a usage price per sale unit, and adds nothing up', () => {
    render(<PriceSummary entitlementBySlug={entitlementBySlug} prices={[base, usage]} />);

    expect(summary()).toBe('$29.00/month + $1.50 per 1k requests');
    // No headline sums a price per unit into a flat fee.
    expect(screen.queryByText(/\$30\.50/)).toBeNull();
  });

  it('joins alternatives with "or" and adds the overage as what it bills above', () => {
    const annual = buildPrice({
      billingPeriod: 'ANNUAL',
      id: 'annual',
      unitAmountDecimal: '29000',
    });
    const overage = buildPrice({
      billingModel: 'OVERAGE',
      id: 'overage',
      metered: { entitlementSlug: 'traces', saleUnitFactor: '100000' },
      unitAmountDecimal: '800',
    });

    render(
      <PriceSummary entitlementBySlug={entitlementBySlug} prices={[base, annual, overage]} />,
    );

    expect(summary()).toBe(
      '$29.00/month or $290.00/year + $8.00 per 100,000 traces above the allowance',
    );
  });

  it('leaves out a deprecated price: it is no longer offered', () => {
    const retired = { ...usage, status: 'DEPRECATED' as const };

    render(<PriceSummary entitlementBySlug={entitlementBySlug} prices={[base, retired]} />);

    expect(summary()).toBe('$29.00/month');
  });

  it('keeps the decimals of a price that is a fraction of a cent', () => {
    const perCall = buildPrice({
      billingModel: 'USAGE_BASED',
      id: 'per-call',
      metered: { entitlementSlug: 'calls', saleUnitFactor: '1' },
      unitAmountDecimal: '0.2',
    });
    const calls = buildEntitlement({
      name: 'API calls',
      resetPeriod: 'MONTH',
      slug: 'calls',
      unit: { plural: 'calls', singular: 'call' },
    });

    render(<PriceSummary entitlementBySlug={new Map([['calls', calls]])} prices={[perCall]} />);

    expect(summary()).toBe('$0.002 per call');
  });

  it('says so when no price is active', () => {
    render(<PriceSummary entitlementBySlug={entitlementBySlug} prices={[]} />);

    expect(summary()).toBe('No active price yet');
  });

  it('reads in French, amounts and units included', async () => {
    await testI18n.changeLanguage('fr');
    render(<PriceSummary entitlementBySlug={entitlementBySlug} prices={[base, usage]} />);

    expect(summary()).toMatch(/^29,00\s\$US\/mois \+ 1,50\s\$US par 1k requests$/);
    await testI18n.changeLanguage('en');
  });
});
