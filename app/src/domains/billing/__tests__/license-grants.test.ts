import { describe, expect, it } from 'vite-plus/test';
import type { LicenseEntitlement } from '@/api-client';
import {
  getOverrideReplacement,
  lowersLicenseOverage,
  lowersLicenseValue,
  readLicenseGrant,
} from '../logic';

const licenseGrant = (value: LicenseEntitlement['value'], percent?: number) =>
  ({
    entitlementSlug: 'api-calls',
    limitCapExceededOveragePercent: percent,
    value,
  }) as LicenseEntitlement;

describe('what a license grants of a number', () => {
  it('is its value and the overage allowance its grant carries', () => {
    expect(
      readLicenseGrant('Pro', licenseGrant({ type: 'number', value: 100 }, 10)),
    ).toEqual({ licenseName: 'Pro', percent: 10, value: 100 });
    expect(
      readLicenseGrant('Pro', licenseGrant({ type: 'number', value: 100 }, 0)),
    ).toEqual({ licenseName: 'Pro', percent: 0, value: 100 });
  });

  it('is a hard limit for a number whose grant sets no allowance, as the API stores it', () => {
    expect(
      readLicenseGrant('Pro', licenseGrant({ type: 'number', value: 100 })),
    ).toEqual({ licenseName: 'Pro', percent: 0, value: 100 });
  });

  it('has neither a value nor an allowance to lower when the license is unlimited', () => {
    expect(
      readLicenseGrant('Pro', licenseGrant({ type: 'number', value: -1 }, -1)),
    ).toEqual({ licenseName: 'Pro', percent: null, value: null });
  });

  it('is nothing for a flag or a configuration, which have no number', () => {
    expect(
      readLicenseGrant('Pro', licenseGrant({ type: 'boolean', value: true })),
    ).toBeNull();
    expect(
      readLicenseGrant('Pro', licenseGrant({ type: 'object', value: {} })),
    ).toBeNull();
  });
});

describe('a value that lowers the one of a license', () => {
  it('is one below it, zero included', () => {
    expect(lowersLicenseValue(2000, 10_000)).toBe(true);
    expect(lowersLicenseValue(0, 10_000)).toBe(true);
  });

  it('is not one that grants as much, or more', () => {
    expect(lowersLicenseValue(10_000, 10_000)).toBe(false);
    expect(lowersLicenseValue(20_000, 10_000)).toBe(false);
  });

  it('is not one against a license that is unlimited or grants no number', () => {
    expect(lowersLicenseValue(2000, null)).toBe(false);
    expect(lowersLicenseValue(2000, undefined)).toBe(false);
    expect(lowersLicenseValue(2000, -1)).toBe(false);
  });

  it('is not one that is empty or not a number', () => {
    expect(lowersLicenseValue(Number.NaN, 10_000)).toBe(false);
    expect(lowersLicenseValue(null, 10_000)).toBe(false);
    expect(lowersLicenseValue(undefined, 10_000)).toBe(false);
    expect(lowersLicenseValue(-1, 10_000)).toBe(false);
  });
});

describe('what an add-on grant puts in place of the license’s value', () => {
  const grant = (overrideBehavior: string, value: unknown) => ({
    overrideBehavior,
    value: { type: 'number', value },
  });

  it('is the value times the quantity for an OVERRIDE', () => {
    expect(getOverrideReplacement(grant('OVERRIDE', 500))).toBe(500);
    expect(getOverrideReplacement(grant('OVERRIDE', 500), 3)).toBe(1500);
  });

  it.each(['ADD', 'MAX'])('is nothing for %s, which never replaces it', (behavior) => {
    expect(getOverrideReplacement(grant(behavior, 500))).toBeNull();
  });

  it('is nothing for a value of 0, which the API ignores, or an unlimited one', () => {
    expect(getOverrideReplacement(grant('OVERRIDE', 0))).toBeNull();
    expect(getOverrideReplacement(grant('OVERRIDE', -1))).toBeNull();
  });

  it('is nothing for a flag or a configuration', () => {
    expect(
      getOverrideReplacement({
        overrideBehavior: 'OVERRIDE',
        value: { type: 'boolean', value: true },
      }),
    ).toBeNull();
    expect(
      getOverrideReplacement({
        overrideBehavior: 'OVERRIDE',
        value: { type: 'object', value: {} },
      }),
    ).toBeNull();
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
