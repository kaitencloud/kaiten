import { graphql } from '@/api-client/graphql';

export const GET_INSTANCES_WITH_RELATIONS = graphql(`
  query GetInstancesWithRelations($limit: Int, $cursor: String) {
    instances(limit: $limit, cursor: $cursor) {
      nextCursor
      hasMore
      items {
        slug
        name
        description
        status
        lifecycleStage
        metadata
        integrations
        customerId
        licenseId
        deploymentZoneId
        startLicenseDate
        endLicenseDate
        createdAt
        customer {
          slug
          id
          name
        }
        license {
          id
          name
          type
        }
      }
    }
  }
`);
