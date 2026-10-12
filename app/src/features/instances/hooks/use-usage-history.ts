import { useInfiniteQuery } from '@tanstack/react-query';
import { useUsageReports } from '@/domains/billing';
import { type UsageHistoryRange, usageHistoryQueryOptions } from '../queries';

/**
 * The usage reports of an entitlement on an instance for a period, a page at a
 * time, with what the screen reads off them: the reports where the limit in force
 * moved, and whether the period reaches before what the organization keeps (an
 * answer, not a failure: the drawer says so and offers to start where the kept
 * usage begins).
 */
export function useUsageHistory(
  instanceSlug: string,
  entitlementSlug: string,
  range: UsageHistoryRange,
) {
  const query = useInfiniteQuery(
    usageHistoryQueryOptions(instanceSlug, entitlementSlug, range),
  );

  return { ...useUsageReports(query), query };
}
