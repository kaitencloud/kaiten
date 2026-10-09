import { describe, expect, it } from 'vite-plus/test';
import type { EntitlementUsage } from '@/api-client';
import {
  buildAddon,
  buildInstanceAddon,
  buildPrice,
} from '../../../../../e2e/app/_support/fixtures';
import {
  diffEffectiveValues,
  getAttachableAddons,
  getFlatFee,
  getHeldAddonLabel,
  getQuantityBounds,
  getQuantityProblem,
  getQuantitySteps,
  isBilledInArrears,
  joinHeldAddons,
} from '../instance-addons.utils';

const seats = buildAddon({
  familySlug: 'extra-seats',
  maxQuantity: 3,
  name: 'Extra seats',
  slug: 'extra-seats-v1',
  versionName: '2026',
});
const storage = buildAddon({
  familySlug: 'extra-storage',
  name: 'Extra storage',
  slug: 'extra-storage-v1',
  versionName: '2026',
});
const heldSeats = buildInstanceAddon({ addon: seats, id: 'held-seats', quantity: 2 });

const usage = (
  entitlementSlug: string,
  limit: EntitlementUsage['limit'],
): EntitlementUsage => ({
  entitlementId: `entitlement-${entitlementSlug}`,
  entitlementSlug,
  licenseId: 'license-business',
  licenseSlug: 'business',
  limit,
  value: { type: 'number', value: 4 },
});

describe('the add-ons an instance holds', () => {
  it('joins each attachment to its version, in the order they were attached', () => {
    const rows = joinHeldAddons(
      [
        buildInstanceAddon({ addon: storage, id: 'held-storage' }),
        heldSeats,
      ],
      [seats, storage],
    );

    expect(rows.map(({ addon }) => addon?.slug)).toEqual([
      'extra-storage-v1',
      'extra-seats-v1',
    ]);
  });

  it('names a version the catalogue does not know by its slug', () => {
    const [row] = joinHeldAddons([heldSeats], []);

    expect(row?.addon).toBeUndefined();
    expect(getHeldAddonLabel(row!)).toBe('extra-seats-v1');
  });

  it('names a known version by its name and which version it is', () => {
    const [row] = joinHeldAddons([heldSeats], [seats]);

    expect(getHeldAddonLabel(row!)).toBe('Extra seats · 2026');
  });
});

describe('the quantity of an add-on', () => {
  it('is at least one, and at most what the version allows when it says', () => {
    expect(getQuantityBounds(seats)).toEqual({ max: 3, min: 1 });
    expect(getQuantityBounds(storage)).toEqual({ max: undefined, min: 1 });
    expect(getQuantityBounds({ maxQuantity: null })).toEqual({
      max: undefined,
      min: 1,
    });
  });

  it('can go down to one and up to the most, and no further', () => {
    expect(getQuantitySteps(1, seats)).toEqual({
      canDecrease: false,
      canIncrease: true,
    });
    expect(getQuantitySteps(2, seats)).toEqual({
      canDecrease: true,
      canIncrease: true,
    });
    expect(getQuantitySteps(3, seats)).toEqual({
      canDecrease: true,
      canIncrease: false,
    });
    expect(getQuantitySteps(500, storage).canIncrease).toBe(true);
  });

  it('is refused when it is not a whole number of units from one to the most', () => {
    expect(getQuantityProblem(1, seats)).toBeUndefined();
    expect(getQuantityProblem(3, seats)).toBeUndefined();
    expect(getQuantityProblem(4, seats)).toBe('max');
    expect(getQuantityProblem(0, seats)).toBe('min');
    expect(getQuantityProblem(-2, seats)).toBe('min');
    expect(getQuantityProblem(1.5, seats)).toBe('min');
    expect(getQuantityProblem(Number.NaN, seats)).toBe('min');
    expect(getQuantityProblem(10_000, storage)).toBeUndefined();
  });
});

describe('what a held add-on is billed', () => {
  const flat = (billingTiming: 'ADVANCE' | 'ARREARS') =>
    buildPrice({
      billingPeriod: 'MONTHLY',
      billingTiming,
      id: `price-${billingTiming}`,
      unitAmountDecimal: '1000',
    });
  const metered = buildPrice({
    billingModel: 'USAGE_BASED',
    id: 'price-metered',
    metered: { entitlementSlug: 'api-calls', saleUnitFactor: '1' },
    unitAmountDecimal: '0.1',
  });

  it('is read from its flat fee, whatever else is metered', () => {
    expect(getFlatFee([metered, flat('ADVANCE')])?.id).toBe('price-ADVANCE');
    expect(getFlatFee([metered])).toBeUndefined();
    expect(getFlatFee([])).toBeUndefined();
  });

  it('bills the period under way even once removed only when the fee is in arrears', () => {
    expect(isBilledInArrears({ prices: [flat('ARREARS')] })).toBe(true);
    expect(isBilledInArrears({ prices: [flat('ADVANCE')] })).toBe(false);
    // A metered price is always in arrears: it is not the fee of the unit.
    expect(isBilledInArrears({ prices: [metered, flat('ADVANCE')] })).toBe(false);
    expect(isBilledInArrears({ prices: [] })).toBe(false);
  });
});

describe('the add-ons an instance can be given', () => {
  const draft = buildAddon({
    familySlug: 'extra-support',
    lifecycleState: 'DRAFT',
    name: 'Support',
    slug: 'extra-support',
  });
  const archived = buildAddon({
    familySlug: 'extra-logs',
    lifecycleState: 'ARCHIVED',
    name: 'Logs',
    slug: 'extra-logs',
  });
  const nextSeats = buildAddon({
    familySlug: 'extra-seats',
    name: 'Extra seats',
    slug: 'extra-seats-v2',
    version: 2,
  });
  const versions = [seats, nextSeats, storage, draft, archived];
  const compatible = new Set(versions.map(({ slug }) => slug));

  it('are on sale and fit the license family of the instance', () => {
    expect(
      getAttachableAddons(versions, {
        compatible: new Set(['extra-storage-v1']),
        held: [],
      }).map(({ slug }) => slug),
    ).toEqual(['extra-storage-v1']);
    expect(
      getAttachableAddons(versions, { compatible, held: [] }).map(
        ({ slug }) => slug,
      ),
    ).toEqual(['extra-seats-v1', 'extra-seats-v2', 'extra-storage-v1']);
  });

  it('leave out every version of a family the instance holds one of', () => {
    expect(
      getAttachableAddons(versions, { compatible, held: [heldSeats] }).map(
        ({ slug }) => slug,
      ),
    ).toEqual(['extra-storage-v1']);
  });
});

describe('what a change did to the effective values', () => {
  const number = (value: number) => ({ type: 'number', value }) as const;

  it('lists the entitlements whose limit is not what it was, with both values', () => {
    expect(
      diffEffectiveValues(
        [usage('seats', number(10)), usage('api-calls', number(1000))],
        [usage('seats', number(20)), usage('api-calls', number(1000))],
      ),
    ).toEqual([{ after: number(20), before: number(10), entitlementSlug: 'seats' }]);
  });

  it('compares the limit and not the counter, which moves with the usage', () => {
    const before = usage('seats', number(10));
    const after = { ...before, value: number(9) } as EntitlementUsage;

    expect(diffEffectiveValues([before], [after])).toEqual([]);
  });

  it('tells an entitlement an add-on grants alone, as it appears and as it goes', () => {
    const flag = { type: 'boolean', value: true } as const;

    expect(diffEffectiveValues([], [usage('priority-support', flag)])).toEqual([
      { after: flag, before: undefined, entitlementSlug: 'priority-support' },
    ]);
    expect(diffEffectiveValues([usage('priority-support', flag)], [])).toEqual([
      { after: undefined, before: flag, entitlementSlug: 'priority-support' },
    ]);
  });

  it('reads a configuration that changed as a change, and one that did not as none', () => {
    const before = { type: 'object', value: { a: 1, b: 2 } } as const;
    const after = { type: 'object', value: { a: 1, b: 3 } } as const;

    expect(diffEffectiveValues([usage('quota', before)], [usage('quota', after)])).toHaveLength(1);
    expect(diffEffectiveValues([usage('quota', before)], [usage('quota', before)])).toEqual([]);
  });

  it('says nothing when either read is missing', () => {
    expect(diffEffectiveValues(undefined, [usage('seats', number(10))])).toEqual([]);
    expect(diffEffectiveValues([usage('seats', number(10))], undefined)).toEqual([]);
  });
});
