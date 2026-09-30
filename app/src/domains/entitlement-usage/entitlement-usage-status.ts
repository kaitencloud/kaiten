import { getUsageRatio, isSoftLimit } from './entitlement-enforcement';

export type UsageStatus =
  | 'HEALTHY'
  | 'WATCH'
  | 'NEAR_LIMIT'
  | 'IN_ALLOWANCE'
  | 'OVER_LIMIT'
  | 'UNBOUNDED';

/**
 * Where a counter stands against its grant. Saturation is measured against
 * what the grant actually permits: a soft limit still has room at the granted
 * value, so reading the raw threshold would call a grant spent while the API
 * kept accepting reports.
 *
 * Past the granted value but under that ceiling is a state of its own,
 * whatever the saturation says: the customer is consuming the overage the
 * grant tolerates, which is the one thing a soft limit exists to allow, and
 * the one figure sales want to hear about.
 */
export const getUsageStatus = (
  value: number,
  threshold: number | null | undefined,
  limitCapExceededOveragePercent?: number | null,
): UsageStatus => {
  const ratio = getUsageRatio(value, threshold, limitCapExceededOveragePercent);

  if (ratio === null) {
    return 'UNBOUNDED';
  }

  // The API rejects a report only above the ceiling, so sitting exactly on it
  // is the last accepted usage, not a breach. getBucketKey splits the same way.
  if (ratio > 1) {
    return 'OVER_LIMIT';
  }
  if (
    threshold !== null &&
    threshold !== undefined &&
    value > threshold &&
    isSoftLimit(threshold, limitCapExceededOveragePercent)
  ) {
    return 'IN_ALLOWANCE';
  }
  if (ratio >= 0.8) {
    return 'NEAR_LIMIT';
  }
  if (ratio >= 0.5) {
    return 'WATCH';
  }

  return 'HEALTHY';
};

/** The states that call for a look: at the wall, past the grant, or past the wall. */
export const isUsageAtRisk = (status: UsageStatus): boolean =>
  status === 'NEAR_LIMIT' ||
  status === 'IN_ALLOWANCE' ||
  status === 'OVER_LIMIT';

/**
 * The colour a status reads in, as a fill and as text. One mapping for the
 * meter, the figures beside it and the badge, so a row never shows a green
 * bar next to an amber number.
 */
export const getUsageStatusTone = (
  status: UsageStatus,
): { fill: string; text: string } => {
  switch (status) {
    case 'OVER_LIMIT':
      return {
        fill: 'bg-destructive',
        text: 'text-destructive-subtle-foreground',
      };
    case 'IN_ALLOWANCE':
    case 'NEAR_LIMIT':
      return { fill: 'bg-warning', text: 'text-warning-subtle-foreground' };
    default:
      return { fill: 'bg-success', text: 'text-success-subtle-foreground' };
  }
};
