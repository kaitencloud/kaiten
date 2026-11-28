import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { entitlementResourcesQueryOptions } from '../queries';

/**
 * The resources of an entitlement that counts per resource on an instance, the pages read so
 * far flattened into one list, with the query that reads the next.
 */
export function useEntitlementResources(
  instanceSlug: string,
  entitlementSlug: string,
) {
  const query = useInfiniteQuery(
    entitlementResourcesQueryOptions(instanceSlug, entitlementSlug),
  );
  const resources = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return { query, resources };
}
