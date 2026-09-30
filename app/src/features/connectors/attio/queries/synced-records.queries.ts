import { graphql } from '@/api-client/graphql';

export const GET_ATTIO_SYNCED_RECORDS = graphql(`
  query GetAttioSyncedRecords($connectorName: String!) {
    customers(hasIntegration: $connectorName) {
      items {
        id
        slug
        name
        integrations
      }
    }
    instances(hasIntegration: $connectorName) {
      items {
        id
        slug
        name
        integrations
      }
    }
  }
`);
