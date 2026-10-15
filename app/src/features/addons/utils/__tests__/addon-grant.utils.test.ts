import { describe, expect, it } from 'vite-plus/test';
import { buildAddonGrant } from '../../../../../e2e/app/_support/fixtures';
import {
  isUnlimitedValue,
  readGrantOverage,
  readGrantValue,
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
    expect(
      readGrantOverage({
        ...number(),
        limitCapExceededOveragePercent: null,
      } as never),
    ).toEqual({ kind: 'inherit' });
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
