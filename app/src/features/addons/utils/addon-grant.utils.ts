import type { AddonEntitlement } from '@/api-client';
import { UNLIMITED_THRESHOLD } from '@/domains/entitlement-usage';

/** How a number grant of an add-on combines with the licence's (`overrideBehavior`). */
export const OVERRIDE_BEHAVIORS = ['ADD', 'OVERRIDE', 'MAX'] as const;

export type OverrideBehavior = (typeof OVERRIDE_BEHAVIORS)[number];

/** What the API takes when a grant names none. */
export const DEFAULT_OVERRIDE_BEHAVIOR: OverrideBehavior = 'MAX';

// Typed against the values, since no check reads a key built from a value at run
// time: a behaviour the API adds fails the type check until it reads in both
// languages.
export const OVERRIDE_BEHAVIOR_LABEL_KEYS = {
  ADD: 'Pages.Addons.Grants.Behaviors.ADD.label',
  MAX: 'Pages.Addons.Grants.Behaviors.MAX.label',
  OVERRIDE: 'Pages.Addons.Grants.Behaviors.OVERRIDE.label',
} as const satisfies Record<OverrideBehavior, string>;

export const OVERRIDE_BEHAVIOR_BLURB_KEYS = {
  ADD: 'Pages.Addons.Grants.Behaviors.ADD.blurb',
  MAX: 'Pages.Addons.Grants.Behaviors.MAX.blurb',
  OVERRIDE: 'Pages.Addons.Grants.Behaviors.OVERRIDE.blurb',
} as const satisfies Record<OverrideBehavior, string>;

/**
 * The kind of value an entitlement takes. `NUMBER_AI_CREDIT` is a number on the
 * API side, with the same value, the same cap and the same overage rules, so a
 * grant of it is edited like a `NUMBER`.
 */
export type GrantType = 'BOOLEAN' | 'CONFIG' | 'NUMBER';

export function toGrantType(
  type: AddonEntitlement['entitlementType'] | undefined,
): GrantType {
  if (type === 'NUMBER' || type === 'NUMBER_AI_CREDIT') {
    return 'NUMBER';
  }

  return type === 'CONFIG' ? 'CONFIG' : 'BOOLEAN';
}

/** What a grant holds, read off its `{type, value}` member. */
export type GrantValue =
  | { kind: 'boolean'; value: boolean }
  | { kind: 'config'; value: Record<string, unknown> }
  /** `-1` is unlimited. A number counts once per unit of quantity. */
  | { kind: 'number'; value: number }
  | { kind: 'unknown' };

export function readGrantValue(
  grant: Pick<AddonEntitlement, 'value'>,
): GrantValue {
  const { type, value } = grant.value;

  if (type === 'number' && typeof value === 'number') {
    return { kind: 'number', value };
  }
  if (type === 'boolean' && typeof value === 'boolean') {
    return { kind: 'boolean', value };
  }
  if (type === 'object' && typeof value === 'object' && value !== null) {
    return { kind: 'config', value: value as Record<string, unknown> };
  }

  return { kind: 'unknown' };
}

export const isUnlimitedValue = (value: GrantValue): boolean =>
  value.kind === 'number' && value.value === UNLIMITED_THRESHOLD;

/**
 * What a number grant does to the overage a license allows. Absent, it inherits
 * the license's. Set, it replaces it on every instance that attaches the add-on:
 * `-1` with an unlimited value, `0` for a hard limit, a percentage for a soft one.
 */
export type GrantOverage =
  | { kind: 'hard' }
  | { kind: 'inherit' }
  /** A boolean or a configuration has nothing to cap. */
  | { kind: 'none' }
  | { kind: 'soft'; percent: number }
  | { kind: 'unlimited' };

export function readGrantOverage(
  grant: Pick<AddonEntitlement, 'limitCapExceededOveragePercent' | 'value'>,
): GrantOverage {
  if (readGrantValue(grant).kind !== 'number') {
    return { kind: 'none' };
  }
  const percent = grant.limitCapExceededOveragePercent;
  if (percent == null) {
    return { kind: 'inherit' };
  }
  if (percent < 0) {
    return { kind: 'unlimited' };
  }

  return percent === 0 ? { kind: 'hard' } : { kind: 'soft', percent };
}
