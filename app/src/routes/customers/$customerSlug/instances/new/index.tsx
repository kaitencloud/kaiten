import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { Instance } from '@/api-client';
import { customerQueryOptions } from '@/features/customers';
import { InstanceFormDialog } from '@/features/instances';

export const Route = createFileRoute('/customers/$customerSlug/instances/new/')(
  {
    component: NewCustomerInstanceRoute,
    pendingComponent: () => null,
  },
);

function NewCustomerInstanceRoute() {
  const { customerSlug } = Route.useParams();

  return <CustomerScopedInstanceDialog customerSlug={customerSlug} />;
}

export function CustomerScopedInstanceDialog({
  customerSlug,
}: {
  customerSlug: string;
}) {
  const navigate = useNavigate();
  const { data: customer } = useSuspenseQuery(
    customerQueryOptions(customerSlug),
  );
  const backToCustomer = () => {
    navigate({ to: '/customers/$customerSlug', params: { customerSlug } });
  };
  // Land on the instance just created rather than back on its customer.
  const openCreatedInstance = (instance: Instance) => {
    if (!instance.slug) {
      backToCustomer();
      return;
    }

    navigate({
      to: '/customers/instances/$instanceSlug',
      params: { instanceSlug: instance.slug },
    });
  };

  return (
    <InstanceFormDialog
      open
      lockedCustomer={{ id: customer.id, name: customer.name }}
      onSuccess={openCreatedInstance}
      onOpenChange={(open) => {
        if (!open) {
          backToCustomer();
        }
      }}
    />
  );
}
