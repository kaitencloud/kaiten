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
 * reads, is refreshed. After a save the baseline moves to the customer the API
 * kept, so that a later save of the same hook compares with what the first one
 * left and not with the customer from before it.
 */
export function useSetBillingEmail(customer: Customer) {
  const queryClient = useQueryClient();
  const customerSlug = customer.slug ?? customer.id;
  // The customer as the dialog opened with it, then as the API kept it at each
  // save: what the address is compared with.
  const [opened, setOpened] = useState<Customer>(customer);

  const mutation = useMutation({
    mutationFn: saveCustomerOnFresh,
    onSuccess: (_saved, { edited }) => {
      // What the person asked for is what the next save compares with: the API
      // may answer with no body, and what it kept for the other members is
      // read again at that save.
      setOpened((previous) => ({
        ...previous,
        billingEmail: edited.billingEmail,
        domain: edited.domain,
        externalCustomerId: edited.externalCustomerId,
        name: edited.name,
      }));

      return invalidateCustomerQueries(queryClient, customerSlug);
    },
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
