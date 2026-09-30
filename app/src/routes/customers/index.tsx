import { createFileRoute } from '@tanstack/react-router';
import { customersWithInstancesQueryOptions } from '@/domains/customer-management';
import { CustomersPageContent } from '@/features/customers';

export const Route = createFileRoute('/customers/')({
  component: CustomersPageContent,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(customersWithInstancesQueryOptions),
});
