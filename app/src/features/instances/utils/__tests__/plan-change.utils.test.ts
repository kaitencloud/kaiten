import { describe, expect, it } from 'vite-plus/test';
import type { CatalogPrice, LicenseWithPrices } from '@/domains/billing';
import { buildPrice } from '../../../../../e2e/app/_support/fixtures/build-pricing';
import {
  buildPlanTargets,
  findPlanTarget,
  getPlanChangeBlock,
  getPlanTargetBlock,
} from '../plan-change.utils';

const price = (id: string, overrides: Partial<Parameters<typeof buildPrice>[0]> = {}) =>
  buildPrice({ id, unitAmountDecimal: '2900', ...overrides });

// A license version as the catalogue reads it: with the active prices it is sold at.
const license = (
  slug: string,
  name: string,
  version: string,
  prices: CatalogPrice[] = [],
  lifecycleState: LicenseWithPrices['lifecycleState'] = 'PUBLISHED',
): LicenseWithPrices => ({
  id: `license-${slug}`,
  lifecycleState,
  name,
  pricingType: 'PAID',
  prices,
  slug,
  version,
});

const CURRENT = price('current');

const licenses = [
  license('pro-v2', 'Pro', '2', [CURRENT, price('pro-v2-annual', { billingPeriod: 'ANNUAL' })]),
  license('pro-v10', 'Pro', '10', [price('pro-v10-usage', { billingModel: 'USAGE_BASED' })]),
  license('pro-v3', 'Pro', '3', [price('pro-v3-monthly'), price('pro-v3-retired', { status: 'DEPRECATED' })]),
  license('pro-v4', 'Pro', '4', [price('pro-v4-monthly')], 'DRAFT'),
  license('pro-v1', 'Pro', '1', [price('pro-v1-monthly')], 'ARCHIVED'),
  license('basic-v1', 'Basic', '1', [price('basic-v1-monthly', { currency: 'EUR' })]),
];

describe('the plans a subscription can move to', () => {
  const targets = buildPlanTargets({
    licenses,
    subscription: { basePrice: CURRENT },
  });

  it('are the active flat fees of the versions on sale, whatever their family', () => {
    expect(targets.map(({ price: { id } }) => id)).toEqual([
      'basic-v1-monthly',
      'pro-v3-monthly',
      'pro-v2-annual',
    ]);
  });

  it('leave out the plan the subscription is on, a draft, an archived version, a retired price and a metered one', () => {
    const ids = targets.map(({ price: { id } }) => id);

    for (const left of ['current', 'pro-v4-monthly', 'pro-v1-monthly', 'pro-v3-retired', 'pro-v10-usage']) {
      expect(ids).not.toContain(left);
    }
  });

  it('leave out a version whose state the console does not know', () => {
    expect(
      buildPlanTargets({
        licenses: [{ ...license('odd', 'Odd', '1', [price('odd-monthly')]), lifecycleState: undefined }],
        subscription: { basePrice: CURRENT },
      }),
    ).toEqual([]);
  });

  it('come grouped by name, the newest version first, and each with the version it belongs to', () => {
    expect(targets.map(({ license: { name, version } }) => `${name} ${version}`)).toEqual([
      'Basic 1',
      'Pro 3',
      'Pro 2',
    ]);
    expect(
      buildPlanTargets({
        licenses: [
          license('pro-v2', 'Pro', '2', [price('a')]),
          license('pro-v10', 'Pro', '10', [price('b')]),
        ],
        subscription: { basePrice: price('other') },
      }).map(({ price: { id } }) => id),
    ).toEqual(['b', 'a']);
  });

  it('carry the version, and not its prices, as the license of a plan', () => {
    expect(targets[1]?.license).toEqual({
      id: 'license-pro-v3',
      lifecycleState: 'PUBLISHED',
      name: 'Pro',
      slug: 'pro-v3',
      version: '3',
      versionName: undefined,
    });
  });

  it('list no version with nothing to offer', () => {
    expect(
      buildPlanTargets({
        licenses: [license('empty', 'Empty', '1')],
        subscription: { basePrice: CURRENT },
      }),
    ).toEqual([]);
  });

  it('find the plan a scheduled change moves to, and none for a price they do not hold', () => {
    expect(findPlanTarget(targets, 'pro-v3-monthly')?.license.version).toBe('3');
    expect(findPlanTarget(targets, 'unknown')).toBeUndefined();
    expect(findPlanTarget(targets, undefined)).toBeUndefined();
  });
});

describe('why a plan cannot be chosen', () => {
  const [other] = buildPlanTargets({
    licenses: [license('basic-v1', 'Basic', '1', [price('eur', { currency: 'EUR' })])],
    subscription: { basePrice: CURRENT },
  });

  it('is the currency: the invoice of the boundary bills the old plan and the new one together', () => {
    expect(getPlanTargetBlock(other, { currency: 'USD' })).toBe('currency');
    expect(getPlanTargetBlock(other, { currency: 'EUR' })).toBeUndefined();
  });
});

describe('whether a subscription takes a plan change', () => {
  it.each([
    [null, 'not-subscribed'],
    [{ cancelAtPeriodEnd: false, status: 'CANCELED' }, 'canceled'],
    [{ cancelAtPeriodEnd: false, status: 'TRIAL' }, 'trial'],
    [{ cancelAtPeriodEnd: true, status: 'ACTIVE' }, 'cancellation-scheduled'],
    [{ cancelAtPeriodEnd: true, status: 'PAST_DUE' }, 'cancellation-scheduled'],
  ] as const)('refuses %j: %s', (subscription, block) => {
    expect(getPlanChangeBlock(subscription)).toBe(block);
  });

  it.each(['ACTIVE', 'PAST_DUE'] as const)('takes one that is %s with no cancellation', (status) => {
    expect(getPlanChangeBlock({ cancelAtPeriodEnd: false, status })).toBeUndefined();
  });
});
