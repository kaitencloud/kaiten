import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useCanPerform } from '@/domains/billing';
import { voucherCustomersQueryOptions } from '../queries';
import { toCustomerNames } from '../utils/voucher-references';

/**
 * The names of the customers vouchers are reserved for, by slug, for the screens that
 * write them out. They are read only by a session that may list customers; without them
 * a voucher shows the slug it holds, which says as much.
 */
export function useVoucherCustomerNames(): Readonly<Record<string, string>> {
  const mayListCustomers = useCanPerform('customers.list');
  const customers = useQuery({
    ...voucherCustomersQueryOptions(),
    enabled: mayListCustomers,
  });

  return useMemo(
    () => toCustomerNames(customers.data?.items ?? []),
    [customers.data],
  );
}
