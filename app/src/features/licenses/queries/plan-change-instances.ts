import { queryOptions } from '@tanstack/react-query';
import { getInstanceBilling, getInstances } from '@/api-client';
import { getProblemCode } from '@/domains/billing';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/pagination';

/** An instance whose subscription is scheduled to move to a price. */
export type PlanChangeInstance = {
  customerName: string;
  effectiveAt: string;
  instanceName: string;
  instanceSlug: string;
};

export const planChangeInstancesBaseQueryKey = [
  'licenses',
  'plan-change-instances',
] as const;

// How many subscriptions are read at once: enough to be quick, few enough not to
// flood the API with one request per instance of the organization.
const CONCURRENCY = 6;

/**
 * Which instances are scheduled to move to a price. The refusal to deprecate a
 * price that a plan change targets says so, and does not say which instance: the
 * API has no list of the changes scheduled, so they are found where they are, in
 * the subscriptions of the instances, one read each. It is a search made only when
 * that refusal has happened, to answer the question a person asks next, and its
 * failure is no failure of the refusal: the screen then says what the API said.
 * An instance that was never subscribed has no subscription (404), which is no
 * match and no error.
 */
export const planChangeInstancesQueryOptions = (priceId: string) =>
  queryOptions({
    queryKey: [...planChangeInstancesBaseQueryKey, priceId] as const,
    queryFn: async ({ signal }): Promise<PlanChangeInstance[]> => {
      const instances = await fetchAllPages(
        async (cursor) =>
          (
            await getInstances({
              query: { cursor, limit: MAX_PAGE_SIZE },
              signal,
              throwOnError: true,
            })
          ).data,
        signal,
      );
      const found: PlanChangeInstance[] = [];
      let next = 0;

      const worker = async () => {
        while (next < instances.length) {
          const instance = instances[next++];
          const instanceSlug = instance.slug ?? instance.id;
          try {
            const { data } = await getInstanceBilling({
              path: { instanceSlug },
              signal,
              throwOnError: true,
            });
            if (data.scheduledChange?.price.id === priceId) {
              found.push({
                customerName: data.customerName,
                effectiveAt: data.scheduledChange.effectiveAt,
                instanceName: data.instanceName,
                instanceSlug,
              });
            }
          } catch (error) {
            if (getProblemCode(error) !== 'GetInstanceBilling.NotFound') {
              throw error;
            }
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, instances.length) }, worker),
      );

      return found.sort((left, right) =>
        left.instanceName.localeCompare(right.instanceName),
      );
    },
    retry: false,
    staleTime: 0,
  });
