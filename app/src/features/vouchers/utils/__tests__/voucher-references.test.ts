import { describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import {
  buildAddon,
  buildEntitlement,
} from '../../../../../e2e/app/_support/fixtures';
import {
  buildVoucherNames,
  getAddonLabel,
  getLicenseLabel,
  isBoostable,
  toCustomerNames,
} from '../voucher-references';

useBillingTexts();

const t = testI18n.t.bind(testI18n);

describe('what a license version and an add-on version are called where they are chosen', () => {
  it('writes the name and the number of a license, since the versions of a product share a name', () => {
    expect(
      getLicenseLabel({ lifecycleState: 'PUBLISHED', name: 'Pro', version: '2' }, t),
    ).toBe('Pro v2');
  });

  it('says what a version that is not on sale is', () => {
    expect(
      getLicenseLabel({ lifecycleState: 'DRAFT', name: 'Pro', version: '3' }, t),
    ).toBe('Pro v3 (draft)');
    expect(
      getLicenseLabel({ lifecycleState: 'ARCHIVED', name: 'Pro', version: '1' }, t),
    ).toBe('Pro v1 (archived)');
    expect(
      getAddonLabel(
        buildAddon({ familySlug: 'extra-seats', lifecycleState: 'ARCHIVED', name: 'Extra seats', slug: 'seats', versionName: '2025' }),
        t,
      ),
    ).toMatch(/\(archived\)$/);
  });
});

describe('the entitlements a boost can change', () => {
  it('are the numbers: the ones that have a value to set, to add to or to multiply', () => {
    expect(isBoostable(buildEntitlement({ name: 'Tokens', slug: 'tokens', type: 'NUMBER' }))).toBe(true);
    expect(
      isBoostable(buildEntitlement({ name: 'Credits', slug: 'credits', type: 'NUMBER_AI_CREDIT' })),
    ).toBe(true);
    expect(isBoostable(buildEntitlement({ name: 'SSO', slug: 'sso', type: 'BOOLEAN' }))).toBe(false);
    expect(isBoostable(buildEntitlement({ name: 'Theme', slug: 'theme', type: 'CONFIG' }))).toBe(false);
  });
});

describe('the names of customers', () => {
  it('maps the slug of a customer to its name, and leaves out one with no slug to be named by', () => {
    expect(
      toCustomerNames([{ name: 'Hooli', slug: 'hooli' }, { name: 'No slug' }]),
    ).toEqual({ hooli: 'Hooli' });
    expect(toCustomerNames([])).toEqual({});
  });
});

describe('the names of what a voucher refers to', () => {
  it('maps the ids and the slugs a voucher holds to the names of what the console read', () => {
    const names = buildVoucherNames({
      addons: [buildAddon({ familySlug: 'extra-seats', name: 'Extra seats', slug: 'seats', versionName: '2026' })],
      customers: [
        { name: 'Hooli', slug: 'hooli' },
        { name: 'No slug' },
      ] as never,
      entitlements: [buildEntitlement({ name: 'Tokens', slug: 'tokens' })],
      licenses: [
        { id: 'license-1', lifecycleState: 'PUBLISHED', name: 'Pro', version: '2' },
      ] as never,
      prices: { 'price-1': 'Pro v2 · Monthly' },
      t,
    });

    expect(names.customers).toEqual({ hooli: 'Hooli' });
    expect(names.entitlements).toEqual({ tokens: 'Tokens' });
    expect(names.licenses).toEqual({ 'license-1': 'Pro v2' });
    expect(Object.values(names.addons)).toHaveLength(1);
    expect(names.prices).toEqual({ 'price-1': 'Pro v2 · Monthly' });
  });

  it('is empty for what the session could not read', () => {
    expect(buildVoucherNames({ t })).toEqual({
      addons: {},
      customers: {},
      entitlements: {},
      licenses: {},
      prices: {},
    });
  });
});
