import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { Customer } from '@/api-client';
import { CustomerFormDialog, CustomersPageContent } from '@/features/customers';

export const Route = createFileRoute('/customers/new/')({
  component: NewCustomerRoute,
  pendingComponent: () => null,
});

function NewCustomerRoute() {
  const navigate = useNavigate();
  const backToList = () => {
    navigate({ to: '/customers' });
  };
  // Land on what was just created: the next step is almost always to add an
  // instance to it or to check it, not to find it again in the list.
  const openCreatedCustomer = (customer: Customer) => {
    if (!customer.slug) {
      backToList();
      return;
    }

    navigate({
      to: '/customers/$customerSlug',
      params: { customerSlug: customer.slug },
    });
  };

  return (
    <CustomersPageContent>
      <CustomerFormDialog
        open
        onSuccess={openCreatedCustomer}
        onOpenChange={(open) => {
          if (!open) {
            backToList();
          }
        }}
      />
    </CustomersPageContent>
  );
}
