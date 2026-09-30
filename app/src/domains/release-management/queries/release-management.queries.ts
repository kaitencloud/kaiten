import { graphql } from '@/api-client/graphql';

export const GET_RELEASE_MANAGEMENT_OVERVIEW = graphql(`
  query GetReleaseManagementOverview($limit: Int, $cursor: String) {
    releases(limit: $limit, cursor: $cursor) {
      nextCursor
      hasMore
      items {
        id
        slug
        version
        description
        createdAt
        createdBy {
          id
          name
        }
        components {
          id
          previousComponentId
          name
          version
          slug
          description
          createdAt
          createdBy {
            id
            name
          }
        }
        deploymentZones {
          id
          name
          slug
          description
          type
          releaseId
          createdAt
          updatedAt
        }
        instances {
          id
          name
          slug
          description
          deploymentZoneId
          customer {
            id
            name
          }
        }
      }
    }
  }
`);
