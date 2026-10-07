import { infiniteQueryOptions } from '@tanstack/react-query';
import { listHandoff } from '@/api-client';
import { listHandoffInfiniteQueryKey } from '@/api-client/@tanstack/react-query.gen';
import type { HandoffQueueStatus } from '../schemas/handoff-search.schema';

const HANDOFF_PAGE_SIZE = 50;

/**
 * The handoff queue in one status, oldest issue first, a page at a time. Reading
 * it never leases an invoice: the consumers do that, with the CLI or an
 * integration, and this is only the view of what they have and have not taken.
 * It keeps the generated key, so that every action on an invoice refreshes it.
 */
export const handoffQueryOptions = (status: HandoffQueueStatus) => {
  const query = { limit: HANDOFF_PAGE_SIZE, status };

  return infiniteQueryOptions({
    queryKey: listHandoffInfiniteQueryKey({ query }),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await listHandoff({
        query: { ...query, cursor: pageParam },
        signal,
        throwOnError: true,
      });

      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    retry: false,
    // A refusal the route's loader met is the answer: the page shows it, with a way
    // to ask again, instead of asking once more by itself behind it.
    retryOnMount: false,
  });
};
