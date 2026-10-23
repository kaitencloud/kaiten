import { createFileRoute, redirect } from '@tanstack/react-router';
import { getCustomerDetailTarget } from '@/features/customers';

export const buildCustomerDetailEditRedirect = (customerSlug: string) => ({
  ...getCustomerDetailTarget(customerSlug),
  replace: true,
  search: (prev: Record<string, unknown>) => ({
    ...prev,
    mode: 'configure' as const,
  }),
});

export const Route = createFileRoute('/customers/$customerSlug/edit')({
  beforeLoad: ({ params: { customerSlug } }) => {
    throw redirect(buildCustomerDetailEditRedirect(customerSlug));
  },
});
