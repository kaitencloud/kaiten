import type { LicenseEntitlement } from '@/api-client';
import { getLicenseEntitlementOveragePercent } from '@/domains/entitlement-usage';

/**
 * What a license version grants of one number entitlement, for the screens that warn
 * about a grant of an add-on or a voucher that would lower it: the version's name, the
 * value it grants (null when it grants none to lower, an unlimited one included) and
 * the overage allowance it tolerates (null when it has none to lower).
 */
export type LicenseGrantReading = {
  licenseName: string;
  percent: number | null;
  value: number | null;
};

/**
 * What a license grant says of its number, or nothing for a boolean or a configuration,
 * which have no value to lower. An unlimited value, and the allowance of an unlimited
 * grant, are left out: nothing replaces them with less.
 */
export function readLicenseGrant(
  licenseName: string,
  grant: LicenseEntitlement,
): LicenseGrantReading | null {
  const percent = getLicenseEntitlementOveragePercent(grant);
  if (percent === null || grant.value?.type !== 'number') {
    return null;
  }
  const { value } = grant.value;

  return {
    licenseName,
    percent: percent < 0 ? null : percent,
    value:
      typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : null,
  };
}

/**
 * Whether a value that replaces a license's is lower than what the license grants. A
 * license that is unlimited, or that grants no number, is never replaced by less: the
 * API keeps it unlimited whatever an add-on or a voucher says.
 */
export function lowersLicenseValue(
  replacement: number | null | undefined,
  licenseValue: number | null | undefined,
): boolean {
  return (
    typeof replacement === 'number' &&
    Number.isFinite(replacement) &&
    replacement >= 0 &&
    typeof licenseValue === 'number' &&
    licenseValue >= 0 &&
    replacement < licenseValue
  );
}

/**
 * What an add-on grant puts in place of the license's value, once it is attached with
 * `quantity` units: the value times the quantity, for an OVERRIDE of a number. Null for
 * every other grant, which never replaces the license's value: a MAX keeps the larger, an
 * ADD adds, a flag and a configuration have no value to lower. A grant of 0 is ignored
 * by the API whatever it does, and an unlimited one is not a lower value.
 */
export function getOverrideReplacement(
  grant: { overrideBehavior?: string; value?: unknown },
  quantity = 1,
): number | null {
  const held = grant.value as { type?: unknown; value?: unknown } | undefined;
  if (
    grant.overrideBehavior !== 'OVERRIDE' ||
    held?.type !== 'number' ||
    typeof held.value !== 'number' ||
    held.value <= 0 ||
    !Number.isFinite(quantity)
  ) {
    return null;
  }

  return held.value * quantity;
}

/**
 * Whether the add-on's own overage allowance is lower than the license's, which hardens
 * the quota of every instance that attaches it: its percentage replaces the license's
 * (an add-on grant that sets one wins over the license's), down to a hard limit at
 * 0. An add-on that inherits, or an unlimited one, changes nothing, and so does one
 * that allows as much.
 */
export function lowersLicenseOverage(
  addonPercent: number | null | undefined,
  licensePercent: number | null | undefined,
): boolean {
  return (
    typeof addonPercent === 'number' &&
    addonPercent >= 0 &&
    typeof licensePercent === 'number' &&
    licensePercent >= 0 &&
    addonPercent < licensePercent
  );
}
