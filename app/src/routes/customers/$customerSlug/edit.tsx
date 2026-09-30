import { createFileRoute, redirect } from '@tanstack/react-router';

export const buildCustomerDetailEditRedirect = (customerSlug: string) => ({
  to: '/customers/$customerSlug' as const,
  params: { customerSlug },
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
