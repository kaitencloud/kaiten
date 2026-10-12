import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Customer } from '@/api-client';
import { updateCustomerMutation } from '@/api-client/@tanstack/react-query.gen';
import {
  customerBillingEmailToUpdateBody,
  invalidateCustomerQueries,
} from '@/domains/customer-management';

/**
 * Sets the billing e-mail of the customer of the instance, from the dialog that
 * subscribes it: the invoices carry the address for the accounting system, and
 * a customer without one would send the person to another page before they could
 * subscribe. It restates the customer, as the update of a customer always does,
 * and refreshes the customer, whose detail the instance page reads.
 */
export function useSetBillingEmail(customer: Customer) {
  const queryClient = useQueryClient();
  const customerSlug = customer.slug ?? customer.id;

  const mutation = useMutation({
    ...updateCustomerMutation({ path: { customerSlug } }),
    onSuccess: () => invalidateCustomerQueries(queryClient, customerSlug),
  });

  return {
    ...mutation,
    save: (billingEmail: string) =>
      mutation.mutateAsync({
        body: customerBillingEmailToUpdateBody(customer, billingEmail),
        path: { customerSlug },
      }),
  };
}
