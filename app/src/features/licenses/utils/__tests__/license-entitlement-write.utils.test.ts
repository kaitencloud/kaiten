import { describe, expect, it } from 'vite-plus/test';
import {
  buildAssociateLicenseEntitlementBody,
  buildLicenseEntitlementValue,
  buildUpdateLicenseEntitlementBody,
  resolveInlineEditSave,
} from '../license-entitlement-write.utils';

describe('buildLicenseEntitlementValue', () => {
  it('builds the typed value for every grant kind', () => {
    expect(
      buildLicenseEntitlementValue({
        enabled: null,
        entitlementType: 'NUMBER',
        threshold: 100,
      }),
    ).toEqual({ type: 'number', value: 100 });
    expect(
      buildLicenseEntitlementValue({
        enabled: null,
        entitlementType: 'NUMBER',
        threshold: null,
      }),
    ).toEqual({ type: 'number', value: -1 });
    expect(
      buildLicenseEntitlementValue({
        enabled: false,
        entitlementType: 'BOOLEAN',
        threshold: null,
      }),
    ).toEqual({ type: 'boolean', value: false });
    expect(
      buildLicenseEntitlementValue({
        configValue: { theme: 'dark' },
        enabled: null,
        entitlementType: 'CONFIG',
        threshold: null,
      }),
    ).toEqual({ type: 'object', value: { theme: 'dark' } });
  });
});

describe('buildAssociateLicenseEntitlementBody', () => {
  it('pairs a capped numeric value with its overage percent', () => {
    expect(
      buildAssociateLicenseEntitlementBody('seats', {
        enabled: null,
        entitlementType: 'NUMBER',
        limitCapExceededOveragePercent: 15,
        threshold: 1000,
      }),
    ).toEqual({
      entitlementSlug: 'seats',
      limitCapExceededOveragePercent: 15,
      value: { type: 'number', value: 1000 },
    });
  });

  it('defaults a capped numeric value to a hard limit and an unlimited one to -1', () => {
    expect(
      buildAssociateLicenseEntitlementBody('seats', {
        enabled: null,
        entitlementType: 'NUMBER',
        threshold: 1000,
      }),
    ).toMatchObject({ limitCapExceededOveragePercent: 0 });
    expect(
      buildAssociateLicenseEntitlementBody('seats', {
        enabled: null,
        entitlementType: 'NUMBER',
        limitCapExceededOveragePercent: 15,
        threshold: -1,
      }),
    ).toMatchObject({
      limitCapExceededOveragePercent: -1,
      value: { type: 'number', value: -1 },
    });
  });

  it('leaves the percent out of non-numeric grants', () => {
    expect(
      buildAssociateLicenseEntitlementBody('sso', {
        enabled: true,
        entitlementType: 'BOOLEAN',
        limitCapExceededOveragePercent: 15,
        threshold: null,
      }),
    ).toEqual({
      entitlementSlug: 'sso',
      limitCapExceededOveragePercent: undefined,
      value: { type: 'boolean', value: true },
    });
  });
});

describe('buildUpdateLicenseEntitlementBody', () => {
  it('always sends the threshold with a percent the API accepts', () => {
    expect(buildUpdateLicenseEntitlementBody(100, 0)).toEqual({
      limitCapExceededOveragePercent: 0,
      value: { type: 'number', value: 100 },
    });
    expect(buildUpdateLicenseEntitlementBody(100, 25)).toMatchObject({
      limitCapExceededOveragePercent: 25,
    });
    expect(buildUpdateLicenseEntitlementBody(-1, 25)).toMatchObject({
      limitCapExceededOveragePercent: -1,
    });
    expect(buildUpdateLicenseEntitlementBody(100, null)).toMatchObject({
      limitCapExceededOveragePercent: 0,
    });
  });
});

describe('resolveInlineEditSave', () => {
  const cappedRow = { limitCapExceededOveragePercent: 20, threshold: 10 };

  it('keeps the stored percent when the threshold changes but stays capped', () => {
    expect(resolveInlineEditSave('threshold', '15', cappedRow)).toEqual({
      kind: 'save',
      limitCapExceededOveragePercent: 20,
      threshold: 15,
    });
  });

  it('forces -1 when the threshold becomes unlimited', () => {
    expect(
      resolveInlineEditSave('threshold', 'Illimité', cappedRow, ['Illimité']),
    ).toEqual({
      kind: 'save',
      limitCapExceededOveragePercent: -1,
      threshold: -1,
    });
  });

  it('starts an unlimited row at a hard limit when it becomes capped', () => {
    expect(
      resolveInlineEditSave('threshold', '100', {
        limitCapExceededOveragePercent: -1,
        threshold: -1,
      }),
    ).toEqual({
      kind: 'save',
      limitCapExceededOveragePercent: 0,
      threshold: 100,
    });
  });

  it('re-sends the current threshold with the edited percent', () => {
    expect(resolveInlineEditSave('overagePercent', '30', cappedRow)).toEqual({
      kind: 'save',
      limitCapExceededOveragePercent: 30,
      threshold: 10,
    });
    expect(resolveInlineEditSave('overagePercent', '', cappedRow)).toEqual({
      kind: 'save',
      limitCapExceededOveragePercent: 0,
      threshold: 10,
    });
  });

  it('reports invalid input with the matching error key', () => {
    expect(resolveInlineEditSave('threshold', '1.5', cappedRow)).toEqual({
      errorKey: 'Pages.Licenses.Entitlements.thresholdError',
      kind: 'invalid',
    });
    expect(resolveInlineEditSave('overagePercent', '-3', cappedRow)).toEqual({
      errorKey: 'Pages.Licenses.Entitlements.overagePercentError',
      kind: 'invalid',
    });
  });

  it('does nothing when the row turned unlimited under an open overage edit', () => {
    expect(
      resolveInlineEditSave('overagePercent', '30', {
        limitCapExceededOveragePercent: -1,
        threshold: -1,
      }),
    ).toEqual({ kind: 'noop' });
  });
});
