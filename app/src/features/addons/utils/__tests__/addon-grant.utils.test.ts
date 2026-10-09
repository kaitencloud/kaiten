import { describe, expect, it } from 'vite-plus/test';
import type { LicenseEntitlement } from '@/api-client';
import { buildAddonGrant } from '../../../../../e2e/app/_support/fixtures';
import {
  getEntitlementSlug,
  isUnlimitedValue,
  lowersLicenseOverage,
  readGrantOverage,
  readGrantValue,
  readLicenseOveragePercent,
  toGrantType,
} from '../addon-grant.utils';

describe('the kind of value an entitlement takes', () => {
  it('is a number for a NUMBER and for an AI-credit number, which are edited alike', () => {
    expect(toGrantType('NUMBER')).toBe('NUMBER');
    expect(toGrantType('NUMBER_AI_CREDIT')).toBe('NUMBER');
  });

  it('is a configuration for a CONFIG, and a flag for any other', () => {
    expect(toGrantType('CONFIG')).toBe('CONFIG');
    expect(toGrantType('BOOLEAN')).toBe('BOOLEAN');
    expect(toGrantType(undefined)).toBe('BOOLEAN');
  });
});

describe('what a grant holds', () => {
  it('is read off its {type, value} member', () => {
    expect(readGrantValue(buildAddonGrant({ addonSlug: 'a', entitlementSlug: 'seats', value: 5 }))).toEqual({
      kind: 'number',
      value: 5,
    });
    expect(readGrantValue(buildAddonGrant({ addonSlug: 'a', entitlementSlug: 'flag', value: true }))).toEqual({
      kind: 'boolean',
      value: true,
    });
    expect(
      readGrantValue(buildAddonGrant({ addonSlug: 'a', entitlementSlug: 'cfg', value: { tier: 'gold' } })),
    ).toEqual({ kind: 'config', value: { tier: 'gold' } });
  });

  it('is unknown when the member does not say what it is', () => {
    expect(readGrantValue({ value: {} })).toEqual({ kind: 'unknown' });
    expect(readGrantValue({ value: { type: 'number', value: 'many' } })).toEqual({ kind: 'unknown' });
    expect(readGrantValue({ value: { type: 'object', value: null } })).toEqual({ kind: 'unknown' });
  });

  it('is unlimited when a number is -1', () => {
    expect(isUnlimitedValue({ kind: 'number', value: -1 })).toBe(true);
    expect(isUnlimitedValue({ kind: 'number', value: 0 })).toBe(false);
    expect(isUnlimitedValue({ kind: 'boolean', value: true })).toBe(false);
  });
});

describe('the overage a grant allows', () => {
  const number = (overagePercent?: number, value = 5) =>
    buildAddonGrant({ addonSlug: 'a', entitlementSlug: 'seats', overagePercent, value });

  it('inherits the license when the grant sets none', () => {
    expect(readGrantOverage(number())).toEqual({ kind: 'inherit' });
  });

  it('is a hard limit at 0, a soft one above, and none to speak of when unlimited', () => {
    expect(readGrantOverage(number(0))).toEqual({ kind: 'hard' });
    expect(readGrantOverage(number(20))).toEqual({ kind: 'soft', percent: 20 });
    expect(readGrantOverage(number(-1, -1))).toEqual({ kind: 'unlimited' });
  });

  it('is nothing for a flag or a configuration, which have no cap to exceed', () => {
    expect(readGrantOverage(buildAddonGrant({ addonSlug: 'a', entitlementSlug: 'f', value: true }))).toEqual({
      kind: 'none',
    });
  });
});

describe('the overage a license allows', () => {
  const licenseGrant = (value: LicenseEntitlement['value'], percent?: number) =>
    ({
      entitlementSlug: 'api-calls',
      limitCapExceededOveragePercent: percent,
      value,
    }) as LicenseEntitlement;

  it('is the percentage its number grant carries', () => {
    expect(readLicenseOveragePercent(licenseGrant({ type: 'number', value: 100 }, 10))).toBe(10);
    expect(readLicenseOveragePercent(licenseGrant({ type: 'number', value: 100 }, 0))).toBe(0);
  });

  it('is none for a license that caps nothing, or grants no number', () => {
    expect(readLicenseOveragePercent(licenseGrant({ type: 'number', value: -1 }, -1))).toBeNull();
    expect(readLicenseOveragePercent(licenseGrant({ type: 'boolean', value: true }))).toBeNull();
  });
});

describe('an add-on that lowers the overage of a license', () => {
  it('is one whose own percentage is below the one of the license, which hardens the quota of every instance that attaches it', () => {
    expect(lowersLicenseOverage(20, 50)).toBe(true);
    expect(lowersLicenseOverage(0, 10)).toBe(true);
  });

  it('is not one that allows as much, or more', () => {
    expect(lowersLicenseOverage(50, 50)).toBe(false);
    expect(lowersLicenseOverage(80, 50)).toBe(false);
  });

  it('is not one that inherits, whose percentage is empty', () => {
    expect(lowersLicenseOverage(Number.NaN, 50)).toBe(false);
    expect(lowersLicenseOverage(undefined, 50)).toBe(false);
    expect(lowersLicenseOverage(null, 50)).toBe(false);
  });

  it('is not one whose license caps nothing, or is unlimited', () => {
    expect(lowersLicenseOverage(20, null)).toBe(false);
    expect(lowersLicenseOverage(20, undefined)).toBe(false);
    expect(lowersLicenseOverage(20, -1)).toBe(false);
    expect(lowersLicenseOverage(-1, 50)).toBe(false);
  });
});

describe('the slug of an entitlement', () => {
  it('is the one the API gives, else the one it would make from the name', () => {
    expect(getEntitlementSlug({ name: 'API Calls', slug: 'api-calls' } as never)).toBe('api-calls');
    expect(getEntitlementSlug({ name: 'API Calls', slug: '  ' } as never)).toBe('api-calls');
    expect(getEntitlementSlug({ name: 'Seats' } as never)).toBe('seats');
  });
});
