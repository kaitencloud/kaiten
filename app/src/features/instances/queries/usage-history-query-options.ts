import { listUsageReports } from '@/api-client';
import { listUsageReportsQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { usageReportPagesQueryOptions } from '@/domains/billing';

/** How many reports a page of the history holds: the API's default, and what the drawer shows before "Load more". */
const USAGE_HISTORY_PAGE_SIZE = 100;

/** The period of a history, in the instants the API takes; either end may be left open. */
export type UsageHistoryRange = {
  /** The start, included. Open, the API reads from 30 days before the end, as far back as the organization keeps usage. */
  from?: string;
  /** The end, excluded. Open, it is now. */
  to?: string;
};

/**
 * What narrows a history: its period, and, for an entitlement that counts per resource, the
 * one resource it is read for. The API applies both, which is why they are in the key.
 */
export type UsageHistoryFilters = UsageHistoryRange & {
  /** Only the reports of this resource; absent, those of every resource of the entitlement. */
  resourceKey?: string;
};

/**
 * The usage reports of an entitlement on an instance, read a page at a time by
 * report number (`usageReportPagesQueryOptions` of the billing domain, which the
 * reports behind an invoice line read the same way). The first page asks for no
 * report number, each next one for the last page's; a 422 for a period that reaches
 * before what the organization keeps is an answer the drawer reads, not a failure
 * to retry. The history is the instances' own, read with the scope of the
 * instances: billing being on or off has no say in it.
 */
export const usageHistoryQueryOptions = (
  instanceSlug: string,
  entitlementSlug: string,
  filters: UsageHistoryFilters,
) => {
  const path = { entitlementSlug, instanceSlug };
  const query = { ...filters, limit: USAGE_HISTORY_PAGE_SIZE };

  return usageReportPagesQueryOptions({
    fetchPage: async (afterSeq, signal) => {
      const { data } = await listUsageReports({
        path,
        query: { ...query, afterSeq },
        signal,
        throwOnError: true,
      });

      return data;
    },
    queryKey: listUsageReportsQueryKey({ path, query }),
  });
};
