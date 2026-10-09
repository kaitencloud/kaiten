import { describe, expect, it } from 'vite-plus/test';
import type { LicenseEntitlement } from '@/api-client';
import type { AddonContribution } from '../../e2e/app/_support/model/billing-instance-addons';
import type { BoostContribution } from '../../e2e/app/_support/model/billing-vouchers';
import {
  composeEffectiveNumber,
  identityProvenance,
} from '../../e2e/app/_support/model/effective-entitlement';

// What the mocks make of a limit, in the order the API composes it
// (api/internal/modules/entitlements/effective): the add-ons, then the boosts.

const grant = (
  value: number,
  limitCapExceededOveragePercent?: number,
): LicenseEntitlement & { value: { type: 'number'; value: number } } =>
  ({
    entitlementName: 'Tokens',
    entitlementSlug: 'tokens',
    entitlementType: 'NUMBER',
    licenseId: 'license-pro',
    licenseSlug: 'pro',
    limitCapExceededOveragePercent,
    value: { type: 'number', value },
  }) as never;

const addon = (
  behavior: AddonContribution['behavior'],
  quantity: number,
  value: number,
  overagePercent?: number,
): AddonContribution => ({
  addonEntitlementId: `grant-${behavior}-${value}`,
  addonId: 'addon-1',
  attachedAt: '2026-09-01T00:00:00.000Z',
  behavior,
  entitlementSlug: 'tokens',
  instanceAddonId: `attachment-${behavior}-${value}`,
  overagePercent,
  quantity,
  value,
});

const boost = (
  modifierType: BoostContribution['modifierType'],
  value?: number,
): BoostContribution => ({
  effectiveStartsAt: '2026-09-10T00:00:00.000Z',
  entitlementSlug: 'tokens',
  instanceVoucherId: `redemption-${modifierType}`,
  modifierType,
  redeemedAt: '2026-09-10T00:00:00.000Z',
  value,
  voucherEntitlementGrantId: `voucher-${modifierType}-tokens`,
  voucherId: `voucher-${modifierType}`,
});

const effective = (
  value: number,
  contributions: AddonContribution[] = [],
  boosts: BoostContribution[] = [],
) => composeEffectiveNumber(grant(value), contributions, boosts);

describe('the limit the mocks compose', () => {
  it('is the license alone, with no composition, where nothing is held', () => {
    const composed = effective(10_000);

    expect(composed.limit).toEqual({ type: 'number', value: 10_000 });
    expect(composed.source).toBe('license');
    expect(composed.provenance).toMatchObject({
      addons: [],
      boosts: [],
      license: { value: { type: 'number', value: 10_000 } },
      number: null,
    });
  });

  it('adds the quantity times the value of each add-on', () => {
    const composed = effective(10_000, [addon('ADD', 3, 1_000)]);

    expect(composed.limit).toEqual({ type: 'number', value: 13_000 });
    expect(composed.provenance?.number).toEqual({
      afterAddons: 13_000,
      boostAdd: null,
      boostMultiply: null,
      boostSet: null,
      effective: 13_000,
      license: 10_000,
      unlimited: false,
    });
  });

  it('replaces the license with the latest attached OVERRIDE, keeps the larger with a MAX, then adds', () => {
    const composed = effective(1_000, [
      addon('OVERRIDE', 1, 3_000),
      addon('OVERRIDE', 2, 5_000),
      addon('MAX', 1, 12_000),
      addon('ADD', 1, 500),
    ]);

    expect(composed.limit).toEqual({ type: 'number', value: 12_500 });
    expect(composed.provenance?.number).toMatchObject({
      afterAddons: 12_500,
      license: 1_000,
    });
  });

  it('adds the vouchers before it multiplies, whatever the order they were redeemed in', () => {
    // 100,000 doubled by a voucher redeemed first, then +50,000 by another.
    const composed = effective(
      100_000,
      [],
      [boost('MULTIPLY', 2), boost('ADD', 50_000)],
    );

    expect(composed.limit).toEqual({ type: 'number', value: 300_000 });
    expect(composed.provenance?.number).toMatchObject({
      boostAdd: 50_000,
      boostMultiply: 2,
      effective: 300_000,
    });
  });

  it('sets the value with the latest SET voucher, in place of the license and the add-ons', () => {
    const composed = effective(
      10_000,
      [addon('ADD', 3, 1_000)],
      [boost('SET', 2_000), boost('SET', 5_000), boost('ADD', 100)],
    );

    expect(composed.limit).toEqual({ type: 'number', value: 5_100 });
    expect(composed.provenance?.number).toMatchObject({
      afterAddons: 13_000,
      boostSet: 5_000,
      effective: 5_100,
    });
  });

  it('is unlimited, and says it, where a voucher lifts the limit', () => {
    const composed = effective(10_000, [], [boost('UNLIMITED')]);

    expect(composed.limit).toEqual({ type: 'number', value: -1 });
    expect(composed.limitCapExceededOveragePercent).toBe(-1);
    expect(composed.provenance?.number).toMatchObject({
      effective: -1,
      unlimited: true,
    });
  });

  it('names the attachment and the redemption each layer comes from, and never a code', () => {
    const composed = effective(
      10_000,
      [addon('ADD', 3, 1_000)],
      [boost('MULTIPLY', 2)],
    );

    expect(composed.provenance?.addons).toEqual([
      {
        addonEntitlementId: 'grant-ADD-1000',
        addonId: 'addon-1',
        attachedAt: '2026-09-01T00:00:00.000Z',
        instanceAddonId: 'attachment-ADD-1000',
        limitCapExceededOveragePercent: null,
        overrideBehavior: 'ADD',
        quantity: 3,
        value: { type: 'number', value: 1_000 },
      },
    ]);
    expect(composed.provenance?.boosts).toEqual([
      {
        effectiveExpiresAt: null,
        effectiveStartsAt: '2026-09-10T00:00:00.000Z',
        instanceVoucherId: 'redemption-MULTIPLY',
        modifierType: 'MULTIPLY',
        modifierValue: 2,
        redeemedAt: '2026-09-10T00:00:00.000Z',
        voucherEntitlementGrantId: 'voucher-MULTIPLY-tokens',
        voucherId: 'voucher-MULTIPLY',
      },
    ]);
  });

  describe('the overage percent', () => {
    it('is the license grant, and a hard limit when it has none', () => {
      expect(
        composeEffectiveNumber(grant(100, 20), [], [])
          .limitCapExceededOveragePercent,
      ).toBe(20);
      expect(effective(100).limitCapExceededOveragePercent).toBe(0);
    });

    it('is the latest attached add-on that sets its own, and no voucher changes it', () => {
      const composed = composeEffectiveNumber(
        grant(100, 20),
        [addon('ADD', 1, 10, 5), addon('ADD', 1, 10), addon('ADD', 1, 10, 0)],
        [boost('MULTIPLY', 2)],
      );

      expect(composed.limitCapExceededOveragePercent).toBe(0);
    });
  });
});

describe('the identity provenance', () => {
  it('is the license layer of a grant, with nothing on top of it and no composition', () => {
    expect(identityProvenance(grant(500, 10))).toEqual({
      addons: [],
      boosts: [],
      license: {
        licenseEntitlementId: 'pro-tokens',
        limitCapExceededOveragePercent: 10,
        value: { type: 'number', value: 500 },
      },
      number: null,
    });
  });
});
