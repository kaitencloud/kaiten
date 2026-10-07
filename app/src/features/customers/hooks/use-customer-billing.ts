import { useBillingCapabilities, useCanPerform } from '@/domains/billing';

/**
 * What a customer screen offers of billing: the billing e-mail where billing is
 * on, and the invoices of the customer where the session may also read them.
 * Billing is absent, not empty, where it is off: nothing of it shows then.
 */
export function useCustomerBilling() {
  const { isEnabled } = useBillingCapabilities();
  const mayReadInvoices = useCanPerform('invoices.list');

  return {
    isBillingEnabled: isEnabled,
    mayReadInvoices: isEnabled && mayReadInvoices,
  };
}
