import { defineFormRecovery } from '@/functionals/form-recovery';
import {
  type CustomerFormValues,
  customerFormSchema,
} from './customer-form.shared';

/**
 * What the creation of a customer keeps when it is left unsent, and what it does
 * not. The billing e-mail is a person's address: it is never written to the device
 * (no personal data in the recovery, §2.15 of the design), and the offer says it has
 * to be entered again. The name, the domain, the external id and the slug are the
 * company's, as the vendor's team knows it. One page: no steps.
 */
export const customerRecovery = defineFormRecovery<CustomerFormValues>({
  formId: 'customers.create',
  version: 1,
  omit: ['billingEmail'],
  schema: customerFormSchema,
  fieldLabels: {
    billingEmail: { key: 'Pages.Customers.Mutation.Form.Labels.billingEmail' },
    domain: { key: 'Pages.Customers.Mutation.Form.Labels.domain' },
    externalCustomerId: {
      key: 'Pages.Customers.Mutation.Form.Labels.customId',
    },
    name: { key: 'Pages.Customers.Mutation.Form.Labels.name' },
    slug: { key: 'Pages.Customers.Mutation.Form.Labels.slug' },
  },
});
