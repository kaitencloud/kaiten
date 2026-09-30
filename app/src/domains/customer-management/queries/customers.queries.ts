import { graphql } from '@/api-client/graphql';

export const GET_CUSTOMERS_WITH_INSTANCES = graphql(`
  query GetCustomersWithInstances($limit: Int, $cursor: String) {
    customers(limit: $limit, cursor: $cursor) {
      nextCursor
      hasMore
      items {
        slug
        name
        externalCustomerId
        domain
        integrations
        createdAt
        updatedAt
        instances {
          slug
          name
          description
          license {
            type
          }
        }
      }
    }
  }
`);
