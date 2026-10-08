import { describe, expect, it } from 'vite-plus/test';
import type { License, Price } from '@/api-client';
import { buildPrice } from '../../../../../e2e/app/_support/fixtures/build-pricing';
import {
  buildPlanTargets,
  findPlanTarget,
  getPlanChangeBlock,
  getPlanTargetBlock,
} from '../plan-change.utils';

const license = (
  slug: string,
  name: string,
  version: string,
  lifecycleState: License['lifecycleState'] = 'PUBLISHED',
): License => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  description: '',
  familyId: `family-${name}`,
  id: `license-${slug}`,
  isDefault: false,
  lifecycleState,
  name,
  slug,
  type: 'PAID',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version,
});

const price = (id: string, overrides: Partial<Parameters<typeof buildPrice>[0]> = {}) =>
  buildPrice({ id, unitAmountDecimal: '2900', ...overrides });

const CURRENT = price('current');

const licenses = [
  license('pro-v2', 'Pro', '2'),
  license('pro-v10', 'Pro', '10'),
  license('pro-v3', 'Pro', '3'),
  license('pro-v4', 'Pro', '4', 'DRAFT'),
  license('pro-v1', 'Pro', '1', 'ARCHIVED'),
  license('basic-v1', 'Basic', '1'),
];

const pricesByLicense = new Map<string, readonly Price[]>([
  ['pro-v2', [CURRENT, price('pro-v2-annual', { billingPeriod: 'ANNUAL' })]],
  ['pro-v3', [price('pro-v3-monthly'), price('pro-v3-retired', { status: 'DEPRECATED' })]],
  ['pro-v4', [price('pro-v4-monthly')]],
  ['pro-v1', [price('pro-v1-monthly')]],
  ['pro-v10', [price('pro-v10-usage', { billingModel: 'USAGE_BASED' })]],
  ['basic-v1', [price('basic-v1-monthly', { currency: 'EUR' })]],
]);

describe('the plans a subscription can move to', () => {
  const targets = buildPlanTargets({
    licenses,
    pricesByLicense,
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

  it('come grouped by name, the newest version first, and each with the version it belongs to', () => {
    expect(targets.map(({ license: { name, version } }) => `${name} ${version}`)).toEqual([
      'Basic 1',
      'Pro 3',
      'Pro 2',
    ]);
    expect(
      buildPlanTargets({
        licenses: [license('pro-v2', 'Pro', '2'), license('pro-v10', 'Pro', '10')],
        pricesByLicense: new Map([
          ['pro-v2', [price('a')]],
          ['pro-v10', [price('b')]],
        ]),
        subscription: { basePrice: price('other') },
      }).map(({ price: { id } }) => id),
    ).toEqual(['b', 'a']);
  });

  it('list no version with nothing to offer', () => {
    expect(
      buildPlanTargets({
        licenses: [license('empty', 'Empty', '1')],
        pricesByLicense: new Map(),
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
    licenses: [license('basic-v1', 'Basic', '1')],
    pricesByLicense: new Map([['basic-v1', [price('eur', { currency: 'EUR' })]]]),
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
