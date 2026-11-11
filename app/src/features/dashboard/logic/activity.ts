import type { DashboardSummary } from '@/api-client';

/**
 * How many days the activity figures cover when a retention cuts the period,
 * or null when they cover all of it.
 *
 * The activity -- usage reports, entitlement reads, flag evaluations, and the
 * active and silent instances they make -- is read from the audit trail and
 * the usage history, which the organization keeps for its own retention. The
 * API reads it from where they start, and says so in `range.activityDays`.
 */
export function activityCutDays(summary: DashboardSummary): number | null {
  const { days, activityDays } = summary.range;
  return activityDays < days ? activityDays : null;
}
