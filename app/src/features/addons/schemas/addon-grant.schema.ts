import { z } from 'zod';
import type { AddonEntitlement, AddonGrant, NewAddonGrant } from '@/api-client';
import { zNewAddonGrant } from '@/api-client/zod.gen';
import { UNLIMITED_THRESHOLD } from '@/domains/entitlement-usage';
import {
  DEFAULT_OVERRIDE_BEHAVIOR,
  type GrantType,
  OVERRIDE_BEHAVIORS,
  readGrantValue,
  toGrantType,
} from '../utils/addon-grant.utils';

/** The largest percentage the API stores: an int16. */
const MAX_OVERAGE_PERCENT = 32_767;

/**
 * The form of a grant. The entitlement picks the kind of value (`grantType` follows
 * it), and the rest is what the API's body has: the value, how a number combines
 * with the license's, and the overage the add-on allows, which is empty to inherit
 * the license's. An empty number is `NaN`, as in every number field of the console.
 * What each kind needs is checked together, each message a key placed on its field.
 */
export const addonGrantFormSchema = zNewAddonGrant
  .pick({ entitlementSlug: true })
  .extend({
    booleanValue: z.boolean(),
    configValue: z.string(),
    entitlementSlug: zNewAddonGrant.shape.entitlementSlug.min(
      1,
      'Pages.Addons.Grants.Form.Errors.entitlement',
    ),
    grantType: z.enum(['BOOLEAN', 'CONFIG', 'NUMBER']),
    numberValue: z.custom<number>((value) => typeof value === 'number'),
    overagePercent: z.custom<number>((value) => typeof value === 'number'),
    // The contract's `MAX` default is the form's starting value: the form always holds one.
    overrideBehavior: z.enum(OVERRIDE_BEHAVIORS),
    unlimited: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.grantType === 'NUMBER') {
      const { numberValue, overagePercent, unlimited } = values;
      if (!unlimited && !(Number.isInteger(numberValue) && numberValue >= 0)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Pages.Addons.Grants.Form.Errors.number',
          path: ['numberValue'],
        });
      }
      if (
        !unlimited &&
        !Number.isNaN(overagePercent) &&
        !(
          Number.isInteger(overagePercent) &&
          overagePercent >= 0 &&
          overagePercent <= MAX_OVERAGE_PERCENT
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Pages.Addons.Grants.Form.Errors.overage',
          path: ['overagePercent'],
        });
      }
    }
    if (values.grantType === 'CONFIG' && !isJsonObject(values.configValue)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pages.Addons.Grants.Form.Errors.config',
        path: ['configValue'],
      });
    }
  });

export type AddonGrantFormValues = z.infer<typeof addonGrantFormSchema>;

function isJsonObject(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);

    return (
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    );
  } catch {
    return false;
  }
}

/** What a new grant starts as: nothing chosen, the license's overage inherited. */
export const initialAddonGrantFormValues = (): AddonGrantFormValues => ({
  booleanValue: true,
  configValue: '{}',
  entitlementSlug: '',
  grantType: 'NUMBER',
  numberValue: Number.NaN,
  overagePercent: Number.NaN,
  overrideBehavior: DEFAULT_OVERRIDE_BEHAVIOR,
  unlimited: false,
});

/** The values of the form of an existing grant. */
export function grantToFormValues(
  grant: AddonEntitlement,
): AddonGrantFormValues {
  const held = readGrantValue(grant);
  const values: AddonGrantFormValues = {
    ...initialAddonGrantFormValues(),
    entitlementSlug: grant.entitlementSlug,
    grantType: toGrantType(grant.entitlementType),
    overrideBehavior: grant.overrideBehavior,
  };

  if (held.kind === 'number') {
    values.unlimited = held.value === UNLIMITED_THRESHOLD;
    values.numberValue = values.unlimited ? Number.NaN : held.value;
    values.overagePercent =
      grant.limitCapExceededOveragePercent === undefined ||
      grant.limitCapExceededOveragePercent < 0
        ? Number.NaN
        : grant.limitCapExceededOveragePercent;
  }
  if (held.kind === 'boolean') {
    values.booleanValue = held.value;
  }
  if (held.kind === 'config') {
    values.configValue = JSON.stringify(held.value, null, 2);
  }

  return values;
}

/** The `{type, value}` the API takes for the kind of value a grant holds. */
function toGrantValue(values: AddonGrantFormValues): NewAddonGrant['value'] {
  switch (values.grantType) {
    case 'NUMBER':
      return {
        type: 'number',
        value: values.unlimited ? UNLIMITED_THRESHOLD : values.numberValue,
      };
    case 'CONFIG':
      return { type: 'object', value: JSON.parse(values.configValue) };
    case 'BOOLEAN':
      return { type: 'boolean', value: values.booleanValue };
  }
}

/**
 * What the kind of a grant leaves of its body. How a number combines with the
 * license's, and the overage it allows, are a number's only: the API combines a
 * boolean by OR and a configuration by override, whatever it is told. The overage is
 * left out to inherit the license's -- the contract declares an integer, not a null
 * -- and an unlimited value allows no overage to set.
 */
function toNumberMembers(
  values: AddonGrantFormValues,
): Pick<AddonGrant, 'limitCapExceededOveragePercent' | 'overrideBehavior'> {
  if (values.grantType !== 'NUMBER') {
    return {};
  }

  return {
    limitCapExceededOveragePercent:
      values.unlimited || Number.isNaN(values.overagePercent)
        ? undefined
        : values.overagePercent,
    overrideBehavior: values.overrideBehavior,
  };
}

/** The body that gives a version a grant. */
export function grantFormValuesToAssignBody(
  values: AddonGrantFormValues,
): NewAddonGrant {
  return {
    entitlementSlug: values.entitlementSlug,
    value: toGrantValue(values),
    ...toNumberMembers(values),
  };
}

/** The body that replaces a grant: its value, how it combines and its overage. */
export function grantFormValuesToUpdateBody(
  values: AddonGrantFormValues,
): AddonGrant {
  return { value: toGrantValue(values), ...toNumberMembers(values) };
}

export type { GrantType };
