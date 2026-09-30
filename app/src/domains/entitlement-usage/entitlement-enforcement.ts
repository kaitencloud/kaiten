import type { LicenseEntitlement } from '@/api-client';

/**
 * How a license grant enforces its own numeric value. The rule lives in two
 * numbers and nothing else: the granted value and the percentage usage may
 * exceed it by. There is no separate hard/soft/unlimited flag.
 *
 * Mirrors `api/internal/modules/entitlements/value/enforcement.go`; keep the
 * two in step, since the server rejects usage on these exact boundaries.
 */

/** Granted value meaning "no cap at all". */
export const UNLIMITED_THRESHOLD = -1;

/**
 * The percentage an unlimited grant must carry, and the only value the API
 * accepts there: with no cap there is nothing to exceed.
 */
export const UNLIMITED_OVERAGE_PERCENT = -1;

export const isUnlimitedThreshold = (
  threshold: number | null | undefined,
): boolean =>
  threshold === null ||
  threshold === undefined ||
  threshold === UNLIMITED_THRESHOLD;

/**
 * The percentage the API would store for this grant, given what it was asked
 * for. An unlimited value forces the unlimited sentinel; a capped value
 * defaults to a hard limit, which is also what a grant written before the
 * field existed reads back as, and what the server falls back to when a write
 * leaves the percentage out.
 */
export const resolveLimitCapExceededOveragePercent = (
  threshold: number | null | undefined,
  limitCapExceededOveragePercent?: number | null,
): number => {
  if (isUnlimitedThreshold(threshold)) {
    return UNLIMITED_OVERAGE_PERCENT;
  }

  if (
    typeof limitCapExceededOveragePercent !== 'number' ||
    !Number.isInteger(limitCapExceededOveragePercent) ||
    limitCapExceededOveragePercent < 0
  ) {
    return 0;
  }

  return limitCapExceededOveragePercent;
};

/**
 * The same rule read off an API grant. Null for the BOOLEAN and CONFIG grants
 * that have no value to cap.
 */
export const getLicenseEntitlementOveragePercent = (
  entitlement: LicenseEntitlement,
): number | null => {
  if (entitlement.value?.type !== 'number') {
    return null;
  }

  return resolveLimitCapExceededOveragePercent(
    entitlement.value.value as number,
    entitlement.limitCapExceededOveragePercent,
  );
};

/** Usage above the granted value is rejected outright. */
export const isHardLimit = (
  threshold: number | null | undefined,
  limitCapExceededOveragePercent?: number | null,
): boolean =>
  !isUnlimitedThreshold(threshold) &&
  resolveLimitCapExceededOveragePercent(
    threshold,
    limitCapExceededOveragePercent,
  ) === 0;

/** Usage may run past the granted value, up to getMaximumAllowedUsage. */
export const isSoftLimit = (
  threshold: number | null | undefined,
  limitCapExceededOveragePercent?: number | null,
): boolean =>
  !isUnlimitedThreshold(threshold) &&
  resolveLimitCapExceededOveragePercent(
    threshold,
    limitCapExceededOveragePercent,
  ) > 0;

/**
 * The highest usage the grant permits, which is what a meter must measure
 * against: a soft limit still has room at the granted value, so a bar that
 * stopped there would read full while the API kept accepting reports. Null
 * when there is no ceiling -- unlimited, unset, or a nonsensical negative
 * value. Zero is a real ceiling: a grant of nothing allows nothing.
 */
export const getMaximumAllowedUsage = (
  threshold: number | null | undefined,
  limitCapExceededOveragePercent?: number | null,
): number | null => {
  if (threshold === null || threshold === undefined || threshold < 0) {
    return null;
  }

  const percent = resolveLimitCapExceededOveragePercent(
    threshold,
    limitCapExceededOveragePercent,
  );

  return percent > 0 ? threshold + (threshold * percent) / 100 : threshold;
};

/**
 * The highest whole usage the grant still accepts, which is the number to put
 * in front of a reader. The ceiling itself can be fractional -- 999 granted
 * with a 53% allowance permits 1528.47 -- and the API rejects only above it,
 * so the last usage it takes is the floor of that, never its rounding.
 */
export const getHighestAcceptedUsage = (
  threshold: number | null | undefined,
  limitCapExceededOveragePercent?: number | null,
): number | null => {
  const ceiling = getMaximumAllowedUsage(
    threshold,
    limitCapExceededOveragePercent,
  );

  return ceiling === null ? null : Math.floor(ceiling);
};

/**
 * How full the grant is, as a share of what it actually permits. Null when
 * nothing caps it. Above 1 for usage past the ceiling, which a saturation
 * view wants to show and a meter does not -- see getUsagePercentage.
 */
export const getUsageRatio = (
  value: number,
  threshold: number | null | undefined,
  limitCapExceededOveragePercent?: number | null,
): number | null => {
  const ceiling = getMaximumAllowedUsage(
    threshold,
    limitCapExceededOveragePercent,
  );

  if (ceiling === null) {
    return null;
  }

  // A grant of nothing leaves no room: any usage at all is past its ceiling,
  // which no finite ratio can express.
  if (ceiling === 0) {
    return value > 0 ? Number.POSITIVE_INFINITY : 1;
  }

  return value / ceiling;
};

/**
 * How full the grant is, as a whole percentage of what it permits, capped at
 * full. Zero when nothing caps it, so a meter has nothing to draw.
 */
export const getUsagePercentage = (
  value: number,
  threshold: number | null | undefined,
  limitCapExceededOveragePercent?: number | null,
): number => {
  const ratio = getUsageRatio(value, threshold, limitCapExceededOveragePercent);

  return ratio === null ? 0 : Math.min(100, Math.round(ratio * 100));
};
