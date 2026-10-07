import { describe, expect, it } from 'vite-plus/test';
import type { License } from '@/api-client';
import {
  buildEntitlement,
  buildGrant,
  buildLicense,
  buildPrice,
} from '../../../../../e2e/app/_support/fixtures';
import {
  canDeprecatePrice,
  canEditPrice,
  getDefaultPrice,
  getGrantAllowance,
  getMeterOptions,
  getNextDisplayOrder,
  getPriceRules,
  getPriceUnitLabel,
  getVersionCurrency,
  sortMeterOptions,
} from '../license-price.utils';

const traces = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Traces',
  resetPeriod: 'MONTH',
  slug: 'traces',
  unit: { plural: 'traces', singular: 'trace' },
});
const requests = buildEntitlement({
  aggregationMethod: 'COUNT',
  name: 'Requests',
  resetPeriod: 'DAY',
  slug: 'requests',
});
const seats = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Seats',
  slug: 'seats',
});
const latency = buildEntitlement({
  aggregationMethod: 'AVERAGE',
  name: 'Latency',
  resetPeriod: 'MONTH',
  slug: 'latency',
});
const credits = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Credits',
  resetPeriod: 'MONTH',
  slug: 'credits',
  type: 'NUMBER_AI_CREDIT',
});
const sso = buildEntitlement({ name: 'SSO', slug: 'sso', type: 'BOOLEAN' });
const theme = buildEntitlement({ name: 'Theme', slug: 'theme', type: 'CONFIG' });
const unlisted = buildEntitlement({ name: 'Exports', slug: 'exports' });

const license = buildLicense({
  description: 'Pro',
  id: 'license-pro',
  name: 'Pro',
  slug: 'pro',
  type: 'PAID',
});
const grant = (
  entitlement: Parameters<typeof buildGrant>[0]['entitlement'],
  value: Parameters<typeof buildGrant>[0]['value'],
  overagePercent?: number,
) => buildGrant({ entitlement, license, overagePercent, value });

const GRANTS = [
  grant(traces, 100_000, 100),
  grant(requests, 1_000, 0),
  grant(seats, 10, 0),
  grant(latency, 500, 0),
  grant(credits, -1),
  grant(sso, true),
  grant(theme, { palette: 'dark' }),
];
const CATALOGUE = [traces, requests, seats, latency, credits, sso, theme, unlisted];

const slugs = (options: ReturnType<typeof getMeterOptions>) =>
  options.map(({ entitlementSlug }) => entitlementSlug);

describe('what a price may meter', () => {
  it('lists the flows the version grants, and the stocks disabled', () => {
    const options = sortMeterOptions(
      getMeterOptions({
        entitlements: CATALOGUE,
        grants: GRANTS,
        model: 'USAGE_BASED',
        prices: [],
      }),
    );

    // Flows by name, then the stock. `latency` is averaged, `sso` and `theme`
    // are not numbers, `exports` is not granted: none of them is listed.
    expect(options.map(({ disabledReason, entitlementSlug }) => [entitlementSlug, disabledReason])).toEqual([
      ['credits', undefined],
      ['requests', undefined],
      ['traces', undefined],
      ['seats', 'stock'],
    ]);
  });

  it('takes a number as summed when its aggregation is not stated', () => {
    const plain = buildEntitlement({ name: 'Plain', resetPeriod: 'WEEK', slug: 'plain' });

    const options = getMeterOptions({
      entitlements: [plain],
      grants: [grant(plain, 5, 0)],
      model: 'USAGE_BASED',
      prices: [],
    });

    expect(slugs(options)).toEqual(['plain']);
  });

  it('offers an overage only on a grant whose overage can be reached', () => {
    const options = getMeterOptions({
      entitlements: CATALOGUE,
      grants: GRANTS,
      model: 'OVERAGE',
      prices: [],
    });
    const byReason = Object.fromEntries(
      options.map((option) => [option.entitlementSlug, option.disabledReason]),
    );

    // 100,000 granted at 100% can be exceeded; a hard limit and an unlimited
    // grant cannot, and an overage price on them could never bill.
    expect(byReason).toMatchObject({
      credits: 'overageUnreachable',
      requests: 'overageUnreachable',
      seats: 'stock',
      traces: undefined,
    });
  });

  it('does not offer an entitlement an active price already meters, unless it is that price being edited', () => {
    const metered = buildPrice({
      billingModel: 'USAGE_BASED',
      id: 'price-traces',
      metered: { entitlementSlug: 'traces', saleUnitFactor: '1' },
      unitAmountDecimal: '10',
    });
    const retired = buildPrice({
      billingModel: 'USAGE_BASED',
      id: 'price-requests',
      metered: { entitlementSlug: 'requests', saleUnitFactor: '1' },
      status: 'DEPRECATED',
      unitAmountDecimal: '10',
    });
    const input = {
      entitlements: CATALOGUE,
      grants: GRANTS,
      model: 'USAGE_BASED' as const,
      prices: [metered, retired],
    };

    expect(slugs(getMeterOptions(input))).not.toContain('traces');
    // A deprecated price meters nothing any more.
    expect(slugs(getMeterOptions(input))).toContain('requests');
    expect(slugs(getMeterOptions({ ...input, editingPriceId: 'price-traces' }))).toContain(
      'traces',
    );
  });
});

describe('the allowance an overage bills against', () => {
  it('is the limit and what the enforcement accepts above it', () => {
    expect(getGrantAllowance(grant(traces, 100_000, 100))).toEqual({
      cap: 200_000,
      limit: 100_000,
    });
    // 999 granted at 53% accepts 1528.47: the highest whole usage is 1528.
    expect(getGrantAllowance(grant(traces, 999, 53))).toEqual({ cap: 1_528, limit: 999 });
  });

  it('is nothing on a hard limit, an unlimited grant or a grant that is not a number', () => {
    expect(getGrantAllowance(grant(traces, 1_000, 0))).toBeUndefined();
    expect(getGrantAllowance(grant(traces, -1))).toBeUndefined();
    expect(getGrantAllowance(grant(sso, true))).toBeUndefined();
    expect(getGrantAllowance(undefined)).toBeUndefined();
  });
});

describe('what a version lets be done to its prices', () => {
  const rulesOf = (lifecycleState: License['lifecycleState']) =>
    getPriceRules({ lifecycleState });
  const active = buildPrice({ id: 'a', unitAmountDecimal: '100' });
  const retired = buildPrice({ id: 'd', status: 'DEPRECATED', unitAmountDecimal: '100' });

  it('edits the prices of a draft, and nothing else', () => {
    expect(rulesOf('DRAFT')).toMatchObject({ canAdd: true, canEdit: true });
    expect(rulesOf('PUBLISHED')).toMatchObject({ canAdd: true, canEdit: false });
    expect(rulesOf('ARCHIVED')).toMatchObject({ canAdd: false, canEdit: false });
    // A version with no state reads as published.
    expect(rulesOf(undefined)).toMatchObject({ canEdit: false, state: 'PUBLISHED' });
  });

  it('never edits a deprecated price, and deprecates only an active one', () => {
    expect(canEditPrice(rulesOf('DRAFT'), active)).toBe(true);
    expect(canEditPrice(rulesOf('DRAFT'), retired)).toBe(false);
    expect(canEditPrice(rulesOf('PUBLISHED'), active)).toBe(false);
    expect(canDeprecatePrice(active)).toBe(true);
    expect(canDeprecatePrice(retired)).toBe(false);
  });
});

describe('the prices of a version', () => {
  const base = buildPrice({
    currency: 'EUR',
    displayOrder: 1,
    id: 'p1',
    isDefault: true,
    unitAmountDecimal: '2900',
  });
  const annual = buildPrice({
    billingPeriod: 'ANNUAL',
    currency: 'EUR',
    displayOrder: 4,
    id: 'p2',
    unitAmountDecimal: '29000',
  });

  it('bill in the currency of the first of them, a deprecated one included', () => {
    expect(getVersionCurrency([])).toBeUndefined();
    expect(
      getVersionCurrency([{ ...base, status: 'DEPRECATED' as const, isDefault: false }]),
    ).toBe('EUR');
  });

  it('give a new one the next display order, and leave the first to the API', () => {
    expect(getNextDisplayOrder([])).toBeUndefined();
    expect(getNextDisplayOrder([base, annual])).toBe(5);
  });

  it('have one default per period, and only an active price is one', () => {
    expect(getDefaultPrice([base, annual], 'MONTHLY')?.id).toBe('p1');
    expect(getDefaultPrice([base, annual], 'ANNUAL')).toBeUndefined();
    expect(
      getDefaultPrice([{ ...base, status: 'DEPRECATED' as const }], 'MONTHLY'),
    ).toBeUndefined();
  });
});

describe('the unit a metered price is per', () => {
  const format = (factor: number) => factor.toLocaleString('en');

  it('is the sale unit the price was captured with', () => {
    expect(
      getPriceUnitLabel(
        { entitlementSlug: 'requests', saleUnitFactor: '1000', saleUnitSingular: '1k requests' },
        undefined,
        format,
      ),
    ).toBe('1k requests');
  });

  it('is the number of base units a sale unit stands for, named by the entitlement', () => {
    expect(
      getPriceUnitLabel({ entitlementSlug: 'traces', saleUnitFactor: '100000' }, traces, format),
    ).toBe('100,000 traces');
  });

  it('is the base unit alone when a sale unit is one of them', () => {
    expect(
      getPriceUnitLabel({ entitlementSlug: 'traces', saleUnitFactor: '1' }, traces, format),
    ).toBe('trace');
    expect(getPriceUnitLabel({ entitlementSlug: 'gone', saleUnitFactor: '1' }, undefined, format)).toBe(
      'gone',
    );
  });
});
