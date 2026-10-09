import { describe, expect, it } from 'vite-plus/test';
import { buildAddonGrant } from '../../../../../e2e/app/_support/fixtures';
import {
  addonGrantFormSchema,
  grantFormValuesToAssignBody,
  grantFormValuesToUpdateBody,
  grantToFormValues,
  initialAddonGrantFormValues,
  type AddonGrantFormValues,
} from '../addon-grant.schema';

const numberGrant = (overrides: Partial<AddonGrantFormValues> = {}): AddonGrantFormValues => ({
  ...initialAddonGrantFormValues(),
  entitlementSlug: 'seats',
  numberValue: 5,
  ...overrides,
});

const issues = (values: AddonGrantFormValues) =>
  Object.fromEntries(
    (addonGrantFormSchema.safeParse(values).error?.issues ?? []).map((issue) => [
      String(issue.path[0]),
      issue.message,
    ]),
  );

describe('what the form of a grant opens with', () => {
  it("is nothing chosen, a number combined as the license's is, by the larger, and the overage inherited", () => {
    expect(initialAddonGrantFormValues()).toEqual({
      booleanValue: true,
      configValue: '{}',
      entitlementSlug: '',
      grantType: 'NUMBER',
      numberValue: Number.NaN,
      overagePercent: Number.NaN,
      overrideBehavior: 'MAX',
      unlimited: false,
    });
  });
});

describe('what a grant needs', () => {
  it('is an entitlement', () => {
    expect(issues(numberGrant({ entitlementSlug: '' }))).toEqual({
      entitlementSlug: 'Pages.Addons.Grants.Form.Errors.entitlement',
    });
  });

  it('is, for a number, a whole number from zero up, or unlimited', () => {
    expect(issues(numberGrant())).toEqual({});
    expect(issues(numberGrant({ numberValue: 0 }))).toEqual({});
    expect(issues(numberGrant({ numberValue: Number.NaN, unlimited: true }))).toEqual({});
    for (const numberValue of [Number.NaN, -1, 1.5]) {
      expect(issues(numberGrant({ numberValue })), String(numberValue)).toEqual({
        numberValue: 'Pages.Addons.Grants.Form.Errors.number',
      });
    }
  });

  it("may set an overage of a whole percentage, or leave it empty to inherit the license's", () => {
    expect(issues(numberGrant({ overagePercent: Number.NaN }))).toEqual({});
    expect(issues(numberGrant({ overagePercent: 0 }))).toEqual({});
    expect(issues(numberGrant({ overagePercent: 32_767 }))).toEqual({});
    for (const overagePercent of [-5, 12.5, 32_768]) {
      expect(issues(numberGrant({ overagePercent })), String(overagePercent)).toEqual({
        overagePercent: 'Pages.Addons.Grants.Form.Errors.overage',
      });
    }
  });

  it('asks nothing of the overage for an unlimited value, which has nothing to exceed', () => {
    expect(issues(numberGrant({ overagePercent: -5, unlimited: true }))).toEqual({});
  });

  it('is, for a configuration, a JSON object', () => {
    const config = (configValue: string): AddonGrantFormValues =>
      numberGrant({ configValue, grantType: 'CONFIG' });

    expect(issues(config('{"tier": "gold"}'))).toEqual({});
    for (const text of ['', '[1]', '"x"', 'null', '{broken']) {
      expect(issues(config(text)), text).toEqual({
        configValue: 'Pages.Addons.Grants.Form.Errors.config',
      });
    }
  });

  it('asks nothing of a flag beyond its entitlement', () => {
    expect(issues(numberGrant({ grantType: 'BOOLEAN', numberValue: Number.NaN }))).toEqual({});
  });
});

describe('the form of a grant that exists', () => {
  it('holds a number, how it combines and its overage', () => {
    const grant = buildAddonGrant({
      addonSlug: 'a',
      behavior: 'ADD',
      entitlementSlug: 'seats',
      overagePercent: 20,
      value: 5,
    });

    expect(grantToFormValues(grant)).toMatchObject({
      entitlementSlug: 'seats',
      grantType: 'NUMBER',
      numberValue: 5,
      overagePercent: 20,
      overrideBehavior: 'ADD',
      unlimited: false,
    });
  });

  it('reads a grant that sets no overage, and an unlimited one, as an empty overage', () => {
    expect(
      grantToFormValues(buildAddonGrant({ addonSlug: 'a', entitlementSlug: 'seats', value: 5 })).overagePercent,
    ).toBeNaN();
    expect(
      grantToFormValues(
        buildAddonGrant({ addonSlug: 'a', entitlementSlug: 'seats', overagePercent: -1, value: -1 }),
      ),
    ).toMatchObject({ unlimited: true, overagePercent: Number.NaN, numberValue: Number.NaN });
  });

  it('holds a flag, and a configuration written out for editing', () => {
    expect(
      grantToFormValues(buildAddonGrant({ addonSlug: 'a', entitlementSlug: 'f', value: false })),
    ).toMatchObject({ booleanValue: false, grantType: 'BOOLEAN' });
    expect(
      grantToFormValues(buildAddonGrant({ addonSlug: 'a', entitlementSlug: 'c', value: { tier: 'gold' } })),
    ).toMatchObject({ configValue: '{\n  "tier": "gold"\n}', grantType: 'CONFIG' });
  });
});

describe('the body that gives a version a grant', () => {
  it('says the number, how it combines and the overage that was typed', () => {
    expect(grantFormValuesToAssignBody(numberGrant({ overagePercent: 20, overrideBehavior: 'ADD' }))).toEqual({
      entitlementSlug: 'seats',
      limitCapExceededOveragePercent: 20,
      overrideBehavior: 'ADD',
      value: { type: 'number', value: 5 },
    });
  });

  it("leaves the overage out to inherit the license's: the contract declares an integer, not a null", () => {
    const body = grantFormValuesToAssignBody(numberGrant());

    expect(body.limitCapExceededOveragePercent).toBeUndefined();
    expect(body).not.toHaveProperty('limitCapExceededOveragePercent', null);
  });

  it('says -1 for an unlimited number, with no overage to set', () => {
    expect(
      grantFormValuesToAssignBody(numberGrant({ overagePercent: 20, unlimited: true })),
    ).toMatchObject({
      limitCapExceededOveragePercent: undefined,
      value: { type: 'number', value: -1 },
    });
  });

  it("says a flag and a configuration with none of a number's members: the API combines them by OR and by override", () => {
    expect(
      grantFormValuesToAssignBody(numberGrant({ booleanValue: false, grantType: 'BOOLEAN' })),
    ).toEqual({ entitlementSlug: 'seats', value: { type: 'boolean', value: false } });
    expect(
      grantFormValuesToAssignBody(numberGrant({ configValue: '{"a":1}', grantType: 'CONFIG' })),
    ).toEqual({ entitlementSlug: 'seats', value: { type: 'object', value: { a: 1 } } });
  });
});

describe('the body that replaces a grant', () => {
  it('says its value, how it combines and its overage, and not the entitlement, which is in the path', () => {
    expect(grantFormValuesToUpdateBody(numberGrant({ overagePercent: 0 }))).toEqual({
      limitCapExceededOveragePercent: 0,
      overrideBehavior: 'MAX',
      value: { type: 'number', value: 5 },
    });
  });
});
