import { queryOptions, useQuery } from '@tanstack/react-query';
import type { GetCustomersWithInstancesQuery } from '@/api-client/graphql/graphql';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/pagination';
import { graphqlClient } from '@/lib/graphql-client';
import type { Customer } from '../types';
import { GET_CUSTOMERS_WITH_INSTANCES } from './customers.queries';

export const customersWithInstancesBaseQueryKey = [
  'customers',
  'with-instances',
] as const;

type CustomerWithInstances =
  GetCustomersWithInstancesQuery['customers']['items'][number];

const toCustomerRows = (customers: CustomerWithInstances[]): Customer[] =>
  customers.map((customer) => ({
    ...customer,
    nbInstances: customer.instances.length,
    licenseTypes: [
      ...new Set(customer.instances.map((instance) => instance.license.type)),
    ],
  }));

export const customersWithInstancesQueryOptions = queryOptions({
  queryKey: customersWithInstancesBaseQueryKey,
  queryFn: async ({ signal }) => {
    const query = GET_CUSTOMERS_WITH_INSTANCES.toString();
    const customers = await fetchAllPages(async (cursor) => {
      const data = await graphqlClient.request<GetCustomersWithInstancesQuery>(
        query,
        { cursor, limit: MAX_PAGE_SIZE },
        signal,
      );
      return data.customers;
    }, signal);
    return toCustomerRows(customers);
  },
});

export const useCustomersWithInstances = () => {
  return useQuery(customersWithInstancesQueryOptions);
};
