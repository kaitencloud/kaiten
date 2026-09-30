import { queryOptions } from '@tanstack/react-query';
import type { GetReleaseManagementOverviewQuery } from '@/api-client/graphql/graphql';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/pagination';
import { graphqlClient } from '@/lib/graphql-client';
import { GET_RELEASE_MANAGEMENT_OVERVIEW } from './release-management.queries';

export const releaseManagementOverviewBaseQueryKey = [
  'releases',
  'management-overview',
] as const;

export const releaseManagementOverviewQueryOptions = queryOptions({
  queryKey: releaseManagementOverviewBaseQueryKey,
  queryFn: async () => {
    const query = GET_RELEASE_MANAGEMENT_OVERVIEW.toString();
    return fetchAllPages(async (cursor) => {
      const data =
        await graphqlClient.request<GetReleaseManagementOverviewQuery>(query, {
          cursor,
          limit: MAX_PAGE_SIZE,
        });
      return data.releases;
    });
  },
});
