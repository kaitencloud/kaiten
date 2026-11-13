import { useInfiniteQuery } from '@tanstack/react-query';
import { listAiInferences } from '@/api-client';
import { listAiInferencesQueryKey } from '@/api-client/@tanstack/react-query.gen';
import {
  type InferenceFilters,
  type InferenceQuery,
  isInvalidRange,
  serverQuery,
} from './inference-filters';

export const FEED_PAGE_SIZE = 50;

type PoolPath = { instanceSlug: string; entitlementSlug: string };

/**
 * The key of the paged feed. It extends the generated key of
 * `listAiInferences` with `infinite: true`, so the cache never hands the pages
 * of this infinite query to a plain read of the same parameters (the receipt's
 * read by transaction id is one), nor the reverse; the generated prefix keeps it
 * under the operation for invalidation.
 */
export function inferenceFeedQueryKey(path: PoolPath, query: InferenceQuery) {
  const [base] = listAiInferencesQueryKey({
    path,
    query: { ...query, limit: FEED_PAGE_SIZE },
  });

  return [{ ...base, infinite: true as const }] as const;
}

/**
 * The inferences of a pool, newest first, one page of 50 at a time ("Load
 * older inferences"). The filters go into the request and the key: the API
 * applies them all.
 */
export function useInferenceFeed(path: PoolPath, filters: InferenceFilters) {
  const query = serverQuery(filters);
  const invalidRange = isInvalidRange(query);
  const feed = useInfiniteQuery({
    enabled: !invalidRange,
    queryKey: inferenceFeedQueryKey(path, query),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      (
        await listAiInferences({
          path,
          query: { ...query, limit: FEED_PAGE_SIZE, cursor: pageParam },
          signal,
          throwOnError: true,
        })
      ).data,
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor : undefined),
  });
  const rows = feed.data?.pages.flatMap((page) => page.items ?? []) ?? [];

  return { feed, invalidRange, rows };
}
