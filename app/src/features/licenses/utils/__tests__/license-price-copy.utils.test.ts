import { describe, expect, it } from 'vite-plus/test';
import { buildPrice } from '../../../../../e2e/app/_support/fixtures';
import {
  getCopiablePrices,
  getCopyFailure,
  getPriceCopyState,
  isCopyOf,
  PriceCopyError,
  priceCopyBody,
} from '../license-price-copy.utils';

const base = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Pro, monthly',
  displayOrder: 1,
  id: 'base',
  isDefault: true,
  unitAmountDecimal: '2900',
});
const retired = buildPrice({
  billingPeriod: 'ANNUAL',
  displayOrder: 1,
  id: 'retired',
  status: 'DEPRECATED',
  unitAmountDecimal: '29000',
});
const overage = buildPrice({
  billingModel: 'OVERAGE',
  displayLabel: 'Traces, overage',
  displayOrder: 2,
  id: 'over',
  metered: { entitlementSlug: 'traces', saleUnitFactor: '100000' },
  unitAmountDecimal: '800',
});
const SOURCE = [base, retired, overage];

describe('the prices a new version starts with', () => {
  it('are the active ones, in the order of the version it starts from', () => {
    expect(getCopiablePrices(SOURCE).map(({ id }) => id)).toEqual([
      'base',
      'over',
    ]);
  });
});

describe('the request that copies a price', () => {
  it('keeps what the price is: shape, timing, period, currency, amount and label', () => {
    expect(priceCopyBody(base, [])).toEqual({
      billingModel: 'FLAT_FEE',
      billingPeriod: 'MONTHLY',
      billingTiming: 'ADVANCE',
      currency: 'USD',
      displayLabel: 'Pro, monthly',
      displayOrder: undefined,
      isDefault: true,
      meteredEntitlementSlug: undefined,
      unitAmountDecimal: '2900',
    });
  });

  it('names the entitlement a metered price meters, and sends no default for it', () => {
    expect(priceCopyBody(overage, [base])).toMatchObject({
      billingModel: 'OVERAGE',
      billingTiming: 'ARREARS',
      displayOrder: 2,
      isDefault: undefined,
      meteredEntitlementSlug: 'traces',
      unitAmountDecimal: '800',
    });
  });

  it('takes its place after the prices the new version has, whatever order the original had', () => {
    const copied = buildPrice({ displayOrder: 7, id: 'x', unitAmountDecimal: '1' });

    expect(priceCopyBody(overage, [copied]).displayOrder).toBe(8);
  });

  it('leaves the label to the API when the original had none', () => {
    expect(
      priceCopyBody({ ...overage, displayLabel: '' }, []).displayLabel,
    ).toBeUndefined();
  });
});

describe('what is a copy of a price', () => {
  it('is the same offer on another version, whatever its id and order', () => {
    expect(isCopyOf({ ...base, displayOrder: 5, id: 'other' }, base)).toBe(true);
  });

  it('is not an offer that differs by amount, period, meter or label', () => {
    expect(isCopyOf({ ...base, unitAmountDecimal: '3900' }, base)).toBe(false);
    expect(isCopyOf({ ...base, billingPeriod: 'ANNUAL' }, base)).toBe(false);
    expect(isCopyOf({ ...base, displayLabel: 'Other' }, base)).toBe(false);
    expect(
      isCopyOf(
        { ...overage, metered: { entitlementSlug: 'requests', saleUnitFactor: '1' } },
        overage,
      ),
    ).toBe(false);
  });

  it('reads a label the API stored as empty as no label', () => {
    expect(isCopyOf({ ...base, displayLabel: '' }, { ...base, displayLabel: undefined })).toBe(true);
  });
});

describe('where a copy of prices stands', () => {
  it('has everything left to copy on a version with no price', () => {
    const state = getPriceCopyState(SOURCE, []);

    expect(state.copied).toEqual([]);
    expect(state.pending.map(({ id }) => id)).toEqual(['base', 'over']);
  });

  it('has what is left after a copy that stopped halfway', () => {
    const state = getPriceCopyState(SOURCE, [{ ...base, id: 'copy-1' }]);

    expect(state.copied.map(({ id }) => id)).toEqual(['base']);
    expect(state.pending.map(({ id }) => id)).toEqual(['over']);
  });

  it('has nothing left once every active price has its copy, the retired one never being copied', () => {
    const state = getPriceCopyState(SOURCE, [
      { ...base, id: 'copy-1' },
      { ...overage, id: 'copy-2' },
    ]);

    expect(state.pending).toEqual([]);
  });

  it('does not take a price made by hand for a copy of another, and lets one price answer for one only', () => {
    const twin = { ...base, id: 'twin' };
    const state = getPriceCopyState([base, twin, overage], [{ ...base, id: 'copy-1' }]);

    expect(state.copied.map(({ id }) => id)).toEqual(['base']);
    expect(state.pending.map(({ id }) => id)).toEqual(['twin', 'over']);
  });
});

describe('a copy of prices that stopped', () => {
  it('says what refused it, which is what the person is told', () => {
    const refusal = new Error('an overage price needs a grant');

    expect(getCopyFailure(new PriceCopyError(refusal))).toBe(refusal);
    expect(new PriceCopyError(refusal).message).toBe(refusal.message);
  });

  it('leaves any other failure as it is', () => {
    const failure = new Error('the version was not created');

    expect(getCopyFailure(failure)).toBe(failure);
  });
});
