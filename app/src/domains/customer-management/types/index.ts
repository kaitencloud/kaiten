import type { GetCustomersWithInstancesQuery } from '@/api-client/graphql/graphql';

export type CustomerLicenseType =
  GetCustomersWithInstancesQuery['customers']['items'][number]['instances'][number]['license']['type'];

// Extract customer type from GraphQL query and add computed fields
export type Customer =
  GetCustomersWithInstancesQuery['customers']['items'][number] & {
    nbInstances: number;
    licenseTypes: CustomerLicenseType[];
  };
