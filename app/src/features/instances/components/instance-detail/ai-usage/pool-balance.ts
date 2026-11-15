import type { EntitlementUsage } from '@/api-client';

/** Where a pool stands against its included limit and its maximum. */
export type PoolState =
  | 'UNLIMITED'
  | 'OK'
  | 'NEAR_LIMIT'
  | 'IN_OVERAGE'
  | 'OVERDRAWN';

export type PoolBalance = {
  consumed: number;
  reserved: number;
  /** Included credits; -1 when unlimited. */
  allowance: number;
  /** The overage percent above the included credits; null when unlimited. */
  overagePercent: number | null;
  /** Included credits plus the permitted overage; null when unlimited. */
  maximum: number | null;
  /** `maximum − consumed − reserved`; null when unlimited. */
  available: number | null;
  /** How far consumed and reserved exceed the maximum; 0 when they do not. */
  overdrawnBy: number;
  /** Consumed plus reserved, what the meter draws. */
  used: number;
  /** Consumed as a share of the maximum, for the meter (0–100). */
  consumedPercent: number;
  /** Reserved as a share of the maximum, after consumed (0–100). */
  reservedPercent: number;
  /** Where the included limit sits on the meter (0–100); null without one. */
  limitPercent: number | null;
  /** Consumed as a share of the included credits (0–∞); null without them. */
  consumedOfIncluded: number | null;
  /**
   * The consumption at which the pool's early warning fires: the included
   * credits × the entitlement's `warningThresholdPercent`. Null when the pool
   * has no threshold (0 or blank) or no included limit.
   */
  warningBoundary: number | null;
  state: PoolState;
};

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function stateOf(
  consumed: number,
  used: number,
  allowance: number,
  available: number | null,
  warningBoundary: number | null,
): PoolState {
  if (available === null) {
    return 'UNLIMITED';
  }
  if (available < 0) {
    return 'OVERDRAWN';
  }
  if (used > allowance) {
    return 'IN_OVERAGE';
  }

  // The API's own boundary, on what it counts: consumption, not open holds.
  return warningBoundary !== null && consumed >= warningBoundary
    ? 'NEAR_LIMIT'
    : 'OK';
}

/**
 * The balance of a credit pool from the usage read: what is left to reserve
 * once open holds are counted, and the shares the meter draws. An allowance of
 * -1, or an overage of -1 %, is unlimited. "Near its limit" is the entitlement's
 * own early warning (`warningThresholdPercent`), which the usage read does not
 * carry: the caller passes it from the entitlement. Without one the pool is
 * never "near".
 */
export function creditBalance(
  usage: EntitlementUsage,
  warningThresholdPercent?: number | null,
): PoolBalance {
  const consumed = usage.value.type === 'number' ? usage.value.value : 0;
  const reserved = Number(usage.reserved ?? 0);
  const allowance = usage.limit?.type === 'number' ? usage.limit.value : -1;
  const percent = usage.limitCapExceededOveragePercent ?? 0;
  const unlimited = allowance < 0 || percent < 0;
  // `limit × (1 + percent ÷ 100)`, as the API gates, in the order that keeps
  // whole numbers whole (5,000 at 10 % is 5,500, not 5,500.000000000001).
  const maximum = unlimited ? null : (allowance * (100 + percent)) / 100;
  const available = maximum == null ? null : maximum - consumed - reserved;
  const warningBoundary =
    !unlimited && allowance > 0 && (warningThresholdPercent ?? 0) > 0
      ? (allowance * (warningThresholdPercent ?? 0)) / 100
      : null;
  const consumedPercent =
    maximum && maximum > 0 ? clampPercent((consumed / maximum) * 100) : 0;
  const reservedPercent =
    maximum && maximum > 0
      ? Math.min(
          100 - consumedPercent,
          clampPercent((reserved / maximum) * 100),
        )
      : 0;

  return {
    consumed,
    reserved,
    allowance,
    overagePercent: unlimited ? null : percent,
    maximum,
    available,
    overdrawnBy: available !== null && available < 0 ? -available : 0,
    used: consumed + reserved,
    consumedPercent,
    reservedPercent,
    limitPercent:
      maximum && maximum > 0 && maximum > allowance
        ? clampPercent((allowance / maximum) * 100)
        : null,
    consumedOfIncluded:
      !unlimited && allowance > 0 ? consumed / allowance : null,
    warningBoundary,
    state: stateOf(
      consumed,
      consumed + reserved,
      allowance,
      available,
      warningBoundary,
    ),
  };
}
