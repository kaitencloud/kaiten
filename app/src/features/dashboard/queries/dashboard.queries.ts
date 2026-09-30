import { graphql } from '@/api-client/graphql';

export const GET_DASHBOARD_DATA = graphql(`
  query GetDashboardData {
    customers {
      items {
        id
        slug
        name
        createdAt
      }
    }
    instances {
      items {
        id
        slug
        name
        customerId
        licenseId
        startLicenseDate
        endLicenseDate
        createdAt
        license {
          id
          slug
          name
          type
        }
      }
    }
    licenses {
      items {
        id
        slug
        name
        type
      }
    }
  }
`);

export const GET_CUSTOMERS = graphql(`
  query GetCustomers {
    customers {
      items {
        id
        slug
        name
        createdAt
      }
    }
  }
`);

export const GET_INSTANCES = graphql(`
  query GetInstances {
    instances {
      items {
        id
        slug
        name
        customerId
        licenseId
        startLicenseDate
        endLicenseDate
        createdAt
        license {
          id
          slug
          name
          type
        }
      }
    }
  }
`);

export const GET_LICENSES = graphql(`
  query GetLicenses {
    licenses {
      items {
        id
        slug
        name
        type
      }
    }
  }
`);
