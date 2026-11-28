import { infiniteQueryOptions } from '@tanstack/react-query';
import { listEntitlementResources } from '@/api-client';
import { listEntitlementResourcesInfiniteQueryKey } from '@/api-client/@tanstack/react-query.gen';

/** How many resources a page of the list holds: the API's default, and what the drawer shows before "Load more". */
export const ENTITLEMENT_RESOURCES_PAGE_SIZE = 50;

/**
 * The resources of an entitlement that counts per resource on an instance, read a page at a
 * time in the order of their keys (the API's), each with its counter in the usage window the
 * entitlement is in. The key is the generated one of the paged read, so that an invalidation
 * of the operation reaches it, and the first page asks for no cursor, each next one for the
 * last page's. It is never retried: a refusal (a session that may not list them, an
 * entitlement that counts per instance) is the answer the drawer shows, once, with a way to
 * ask again.
 */
export const entitlementResourcesQueryOptions = (
  instanceSlug: string,
  entitlementSlug: string,
) => {
  const path = { entitlementSlug, instanceSlug };
  const query = { limit: ENTITLEMENT_RESOURCES_PAGE_SIZE };

  return infiniteQueryOptions({
    queryKey: listEntitlementResourcesInfiniteQueryKey({ path, query }),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await listEntitlementResources({
        path,
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
    retryOnMount: false,
  });
};
