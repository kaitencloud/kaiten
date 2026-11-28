import type { QueryClient } from '@tanstack/react-query';
import { getEntitlementsUsageMetricsQueryKey } from '@/api-client/@tanstack/react-query.gen';

/**
 * A combined entitlement is computed when it is read, from the usage of its sources, and sits
 * in the usage of every instance that is granted one of them: one created, saved with other
 * sources or weights, or deleted changes what each instance reads. The instance is in the key
 * and none is named, so the read of every one is read again.
 */
export function invalidateInstanceUsage(queryClient: QueryClient) {
  const [{ _id }] = getEntitlementsUsageMetricsQueryKey({
    path: { instanceSlug: '' },
  });

  return queryClient.invalidateQueries({ queryKey: [{ _id }] });
}
