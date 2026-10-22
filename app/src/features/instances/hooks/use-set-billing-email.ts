import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Customer } from '@/api-client';
import {
  customerBillingEmailToUpdateBody,
  customerToUpdateBody,
  invalidateCustomerQueries,
  saveCustomerOnFresh,
} from '@/domains/customer-management';

/**
 * Sets the billing e-mail of the customer of the instance, from the dialog that
 * subscribes it: the invoices carry the address for the accounting system, and
 * a customer without one would send the person to another page before they could
 * subscribe. The update restates the customer, so the customer is read again
 * first and only the address is applied on top of it: a rename made in another
 * tab since the dialog opened stays. The customer, whose detail the instance page
 * reads, is refreshed.
 */
export function useSetBillingEmail(customer: Customer) {
  const queryClient = useQueryClient();
  const customerSlug = customer.slug ?? customer.id;
  // The customer as the dialog opened with it: what the address is compared with.
  const [opened] = useState(customer);

  const mutation = useMutation({
    mutationFn: saveCustomerOnFresh,
    onSuccess: () => invalidateCustomerQueries(queryClient, customerSlug),
  });

  return {
    ...mutation,
    save: (billingEmail: string) =>
      mutation.mutateAsync({
        customerSlug,
        edited: customerBillingEmailToUpdateBody(opened, billingEmail),
        opened: customerToUpdateBody(opened),
      }),
  };
}
