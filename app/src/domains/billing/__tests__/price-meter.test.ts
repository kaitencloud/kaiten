import { describe, expect, it } from 'vite-plus/test';
import {
  buildEntitlement,
  buildGrant,
  buildLicense,
  buildPrice,
} from '../../../../e2e/app/_support/fixtures';
import {
  getEntitlementSlug,
  getGrantAllowance,
  getMeterOptions,
  hasActiveFlatFee,
  sortMeterOptions,
} from '../logic/price-meter';

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

// A license version's own grant is the allowance an overage bills above.
const licenseOptions = (
  input: Omit<Parameters<typeof getMeterOptions>[0], 'overage'>,
) => getMeterOptions({ ...input, overage: 'license' });
const addonOptions = (
  input: Omit<Parameters<typeof getMeterOptions>[0], 'overage'>,
) => getMeterOptions({ ...input, overage: 'instance' });

const slugs = (options: ReturnType<typeof licenseOptions>) =>
  options.map(({ entitlementSlug }) => entitlementSlug);

describe('what a price may meter', () => {
  it('lists the flows the version grants, and the stocks disabled', () => {
    const options = sortMeterOptions(
      licenseOptions({
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

    const options = licenseOptions({
      entitlements: [plain],
      grants: [grant(plain, 5, 0)],
      model: 'USAGE_BASED',
      prices: [],
    });

    expect(slugs(options)).toEqual(['plain']);
  });

  it('offers an overage only on a grant whose overage can be reached', () => {
    const options = licenseOptions({
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
      metered: { entitlementSlug: 'traces', saleUnitFactor: '1', saleUnitPlural: null, saleUnitSingular: null },
      unitAmountDecimal: '10',
    });
    const retired = buildPrice({
      billingModel: 'USAGE_BASED',
      id: 'price-requests',
      metered: { entitlementSlug: 'requests', saleUnitFactor: '1', saleUnitPlural: null, saleUnitSingular: null },
      status: 'DEPRECATED',
      unitAmountDecimal: '10',
    });
    const input = {
      entitlements: CATALOGUE,
      grants: GRANTS,
      model: 'USAGE_BASED' as const,
      prices: [metered, retired],
    };

    expect(slugs(licenseOptions(input))).not.toContain('traces');
    // A deprecated price meters nothing any more.
    expect(slugs(licenseOptions(input))).toContain('requests');
    expect(slugs(licenseOptions({ ...input, editingPriceId: 'price-traces' }))).toContain(
      'traces',
    );
  });
});

describe('what a price of an add-on may meter', () => {
  it('lists the flows the add-on grants and its stocks disabled, as a license version does', () => {
    const options = sortMeterOptions(
      addonOptions({
        entitlements: CATALOGUE,
        grants: GRANTS,
        model: 'USAGE_BASED',
        prices: [],
      }),
    );

    expect(options.map(({ disabledReason, entitlementSlug }) => [entitlementSlug, disabledReason])).toEqual([
      ['credits', undefined],
      ['requests', undefined],
      ['traces', undefined],
      ['seats', 'stock'],
    ]);
  });

  it('offers an overage on every flow it grants, and states no allowance, which is the instance\'s', () => {
    const options = addonOptions({
      entitlements: CATALOGUE,
      grants: GRANTS,
      model: 'OVERAGE',
      prices: [],
    });

    // The grant of an add-on adds to the license's limit and may inherit its percent:
    // whether the overage is reached is not for the add-on's grant alone to say.
    expect(options.filter(({ entitlementSlug }) => entitlementSlug !== 'seats')).toSatisfy(
      (flows: typeof options) =>
        flows.length === 3 &&
        flows.every(({ allowance, disabledReason }) => allowance === undefined && disabledReason === undefined),
    );
  });

  it('does not offer an entitlement an active price of the add-on already meters', () => {
    const metered = buildPrice({
      billingModel: 'USAGE_BASED',
      id: 'price-traces',
      metered: { entitlementSlug: 'traces', saleUnitFactor: '1', saleUnitPlural: null, saleUnitSingular: null },
      unitAmountDecimal: '10',
    });

    expect(
      slugs(addonOptions({ entitlements: CATALOGUE, grants: GRANTS, model: 'OVERAGE', prices: [metered] })),
    ).not.toContain('traces');
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


describe('the slug of an entitlement', () => {
  it('is the one the API gives, else the one it would make from the name', () => {
    expect(getEntitlementSlug({ name: 'API Calls', slug: 'api-calls' } as never)).toBe('api-calls');
    expect(getEntitlementSlug({ name: 'API Calls', slug: '  ' } as never)).toBe('api-calls');
    expect(getEntitlementSlug({ name: 'Seats' } as never)).toBe('seats');
  });
});

describe('whether a version has a flat fee on sale', () => {
  const flat = buildPrice({ id: 'flat', unitAmountDecimal: '100' });
  const metered = buildPrice({
    billingModel: 'USAGE_BASED',
    id: 'metered',
    unitAmountDecimal: '10',
  });

  it('is so only for an active flat fee, whatever it meters besides', () => {
    expect(hasActiveFlatFee([metered, flat])).toBe(true);
    expect(hasActiveFlatFee([metered])).toBe(false);
    expect(hasActiveFlatFee([{ ...flat, status: 'DEPRECATED' }, metered])).toBe(false);
    expect(hasActiveFlatFee([])).toBe(false);
  });
});
