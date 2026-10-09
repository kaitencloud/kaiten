import { queryOptions } from '@tanstack/react-query';
import type { GetInstancesBillingQuery } from '@/api-client/graphql/graphql';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/pagination';
import { graphqlClient } from '@/lib/graphql-client';
import { logger } from '@/lib/logger';
import {
  type InstanceBillingEntry,
  toInstanceBillingEntries,
} from '../logic/instance-billing-summary';
import { GET_INSTANCES_BILLING } from './instances-billing.queries';

export const instancesBillingBaseQueryKey = [
  'instances',
  'billing-summaries',
] as const;

/**
 * The subscription each instance of the organization is on, as the lists of
 * instances show it: one request for every page of the list, with the page
 * variables of `GetInstancesWithRelations` (the same limit and the same cursors),
 * so that the number of requests follows the number of pages and never the number
 * of instances.
 *
 * Billing is read apart from the list on purpose (see the document), and nothing
 * in the list depends on it: a failure is the answer, not retried, and the screen
 * that asked leaves its column out. It is never sent before billing is on and the
 * session holds read:billing: `useInstancesBilling` is the one that decides.
 */
export const instancesBillingQueryOptions = queryOptions({
  queryFn: async ({ signal }): Promise<InstanceBillingEntry[]> => {
    const query = GET_INSTANCES_BILLING.toString();

    try {
      const items = await fetchAllPages(async (cursor) => {
        const data = await graphqlClient.request<GetInstancesBillingQuery>(
          query,
          { cursor, limit: MAX_PAGE_SIZE },
          signal,
        );

        return data.instances;
      }, signal);

      return toInstanceBillingEntries(items);
    } catch (error) {
      if (!signal.aborted) {
        logger.warn('Instance billing unavailable: the lists go without it', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  },
  queryKey: instancesBillingBaseQueryKey,
  retry: false,
  retryOnMount: false,
});
