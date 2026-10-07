import { describe, expect, it } from 'vite-plus/test';
import { buildPrice } from '../../../../../e2e/app/_support/fixtures';
import {
  getDefaultBase,
  getInitialBase,
  getPreviewBases,
  getPreviewMeters,
} from '../license-price-preview.utils';

const monthly = buildPrice({
  billingPeriod: 'MONTHLY',
  id: 'monthly',
  isDefault: true,
  unitAmountDecimal: '2900',
});
const annual = buildPrice({
  billingPeriod: 'ANNUAL',
  id: 'annual',
  unitAmountDecimal: '29000',
});
const retired = buildPrice({
  billingPeriod: 'QUARTERLY',
  id: 'retired',
  status: 'DEPRECATED',
  unitAmountDecimal: '8000',
});
const traces = buildPrice({
  billingModel: 'OVERAGE',
  id: 'traces',
  metered: { entitlementSlug: 'traces', saleUnitFactor: '100000' },
  unitAmountDecimal: '800',
});
const requests = buildPrice({
  billingModel: 'USAGE_BASED',
  id: 'requests',
  metered: { entitlementSlug: 'requests', saleUnitFactor: '1000' },
  unitAmountDecimal: '150',
});
const oldRequests = buildPrice({
  billingModel: 'USAGE_BASED',
  id: 'old-requests',
  metered: { entitlementSlug: 'api', saleUnitFactor: '1' },
  status: 'DEPRECATED',
  unitAmountDecimal: '20',
});

describe('what an invoice preview starts from', () => {
  it('is a flat fee that can still be billed, in the order of the version', () => {
    expect(
      getPreviewBases([traces, monthly, retired, annual]).map(({ id }) => id),
    ).toEqual(['monthly', 'annual']);
  });

  it('is the default flat fee the API picks when none is named', () => {
    expect(getDefaultBase([annual, monthly])?.id).toBe('monthly');
  });

  it('has no default when the default is retired or the version has none', () => {
    expect(getDefaultBase([annual])).toBeUndefined();
    expect(
      getDefaultBase([{ ...monthly, status: 'DEPRECATED' as const }, annual]),
    ).toBeUndefined();
  });

  it('falls back to the first flat fee for the form to start on, when there is no default', () => {
    expect(getInitialBase([annual, retired])?.id).toBe('annual');
    expect(getInitialBase([annual, monthly])?.id).toBe('monthly');
    expect(getInitialBase([traces])).toBeUndefined();
  });
});

describe('what a sample usage may be given for', () => {
  it('is each entitlement an active metered price rates, in the order of the prices', () => {
    expect(
      getPreviewMeters([monthly, requests, traces]).map(
        ({ entitlementSlug }) => entitlementSlug,
      ),
    ).toEqual(['requests', 'traces']);
  });

  it('leaves out a deprecated price, which rates nothing any more, and a flat fee', () => {
    expect(getPreviewMeters([monthly, oldRequests])).toEqual([]);
  });

  it('keeps the price that rates the entitlement, for what it bills against', () => {
    expect(getPreviewMeters([traces])[0].price.billingModel).toBe('OVERAGE');
  });
});
