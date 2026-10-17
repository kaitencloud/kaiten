import { infiniteQueryOptions } from '@tanstack/react-query';
import type { UsageReport } from '@/api-client';

/** A page of usage reports, whichever operation listed it. */
type ReportPage = { items: UsageReport[]; nextAfterSeq?: number };

type UsageReportPagesOptions<TPage extends ReportPage> = {
  /** Reads the page that comes after report number `afterSeq` (the first page asks after `initialPageParam`). */
  fetchPage: (
    afterSeq: number | undefined,
    signal: AbortSignal,
  ) => Promise<TPage>;
  /** What the first page is asked after: nothing, or report 0. */
  initialPageParam?: number;
  /** The key the generated options give the operation, with the path and the query that make the pair or the line. */
  queryKey: readonly [Record<string, unknown>];
};

/**
 * The usage reports of something (an entitlement of an instance, a metered line of
 * an invoice), read a page at a time by report number: the API answers with the
 * number to read after, and none on the last page. The generated options do not
 * page these operations (they page by `afterSeq`, which they do not know), so the
 * key is the generated one, marked as a paged read as the generated infinite keys
 * are, which keeps an invalidation of the operation reaching it.
 *
 * A 422 for usage the organization no longer keeps is an answer the screen reads,
 * not a failure to retry: nothing is retried, and a refusal that came with the
 * screen is the answer it shows, with a way to ask again, instead of one asked once
 * more by itself behind it.
 */
export function usageReportPagesQueryOptions<TPage extends ReportPage>({
  fetchPage,
  initialPageParam,
  queryKey,
}: UsageReportPagesOptions<TPage>) {
  return infiniteQueryOptions({
    queryKey: [{ ...queryKey[0], _infinite: true }],
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
    initialPageParam: initialPageParam as number | undefined,
    getNextPageParam: (lastPage: TPage) => lastPage.nextAfterSeq ?? undefined,
    retry: false,
    retryOnMount: false,
  });
}
