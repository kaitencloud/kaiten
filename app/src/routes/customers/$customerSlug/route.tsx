import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';
import {
  CustomerDetailPageContent,
  CustomerFormDialog,
  customerQueryOptions,
} from '@/features/customers';

// `kaiten_setup_session` is what Stripe's page brings the customer back with once a
// payment method is saved: the page checks it with the API, then drops it.
const customerDetailSearchSchema = z
  .object({
    kaiten_setup_session: z.string().min(1).optional().catch(undefined),
    mode: z.enum(['configure']).optional(),
  })
  .loose();

export const Route = createFileRoute('/customers/$customerSlug')({
  component: CustomerDetailRouteLayout,
  validateSearch: (search) => customerDetailSearchSchema.parse(search),
  beforeLoad: async ({ context, params: { customerSlug } }) => {
    const customer = await context.queryClient.ensureQueryData(
      customerQueryOptions(customerSlug),
    );

    return { getTitle: () => customer.name };
  },
  loader: ({ context, params: { customerSlug } }) => {
    return context.queryClient.ensureQueryData(
      customerQueryOptions(customerSlug),
    );
  },
});

function CustomerDetailRouteLayout() {
  const navigate = useNavigate();
  const { customerSlug } = Route.useParams();
  const search = Route.useSearch();

  const { data: customer } = useSuspenseQuery(
    customerQueryOptions(customerSlug),
  );

  const closeConfigure = () => {
    navigate({ to: '/customers/$customerSlug', params: { customerSlug } });
  };

  const dropSetupSession = () => {
    navigate({
      params: { customerSlug },
      replace: true,
      search: (previous) => ({ ...previous, kaiten_setup_session: undefined }),
      to: '/customers/$customerSlug',
    });
  };

  return (
    <CustomerDetailPageContent
      customerSlug={customerSlug}
      onSetupHandled={dropSetupSession}
      setupSessionId={search.kaiten_setup_session}
    >
      {search.mode === 'configure' ? (
        <CustomerFormDialog
          open
          customer={customer}
          onSuccess={closeConfigure}
          onOpenChange={(open) => {
            if (!open) {
              closeConfigure();
            }
          }}
        />
      ) : null}
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </CustomerDetailPageContent>
  );
}
