import { useQuery } from '@tanstack/react-query';
import type { GetInstancesWithRelationsQuery } from '@/api-client/graphql/graphql';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/pagination';
import { graphqlClient } from '@/lib/graphql-client';
import { GET_INSTANCES_WITH_RELATIONS } from './instances.queries';

export const instancesWithRelationsBaseQueryKey = [
  'instances',
  'with-relations',
] as const;

export const instancesWithRelationsQueryKey = () =>
  instancesWithRelationsBaseQueryKey;

export const useInstancesWithRelations = () => {
  return useQuery({
    queryKey: instancesWithRelationsQueryKey(),
    queryFn: async (): Promise<GetInstancesWithRelationsQuery> => {
      const query = GET_INSTANCES_WITH_RELATIONS.toString();
      const items = await fetchAllPages(async (cursor) => {
        const data =
          await graphqlClient.request<GetInstancesWithRelationsQuery>(query, {
            cursor,
            limit: MAX_PAGE_SIZE,
          });
        return data.instances;
      });
      // Screens read data.instances.items, so the query's shape is kept.
      return { instances: { hasMore: false, items, nextCursor: null } };
    },
  });
};
