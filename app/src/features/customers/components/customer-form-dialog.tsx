import { useTranslation } from 'react-i18next';
import type { Customer } from '@/api-client';
import { useActionAccess, useLeaveRestrictedDialog } from '@/domains/billing';
import {
  FormRecoveryAnnouncer,
  useFormRecovery,
} from '@/functionals/form-recovery';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import { CustomerForm } from './customer-form';
import { initialCustomerFormValues } from './customer-form.shared';
import { customerRecovery } from './customer-recovery';

type CustomerFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer;
  onSuccess?: (customer: Customer) => void;
};

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSuccess,
}: CustomerFormDialogProps) {
  const access = useActionAccess(
    customer ? 'customers.update' : 'customers.create',
  );

  // The addresses of the forms are opened by hand as well as from their buttons: a session
  // that may not write customers is not given a form that ends in a refusal.
  useLeaveRestrictedDialog(access, () => onOpenChange(false), open);
  if (!access.allowed) {
    return null;
  }

  return (
    <CustomerFormDialogContent
      customer={customer}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      open={open}
    />
  );
}

/**
 * The dialog of a session that may write customers. What a creation typed and did not
 * send is offered back on the next visit; the edit starts from the customer as the API
 * holds it and keeps nothing. The door freezes at its mount whether it is on, so it is
 * opened here, once the access is known, and not while it loads.
 */
function CustomerFormDialogContent({
  open,
  onOpenChange,
  customer,
  onSuccess,
}: CustomerFormDialogProps) {
  const { t } = useTranslation();
  const recovery = useFormRecovery(customerRecovery, {
    enabled: !customer,
    pristine: initialCustomerFormValues,
  });
  // The dialog opens once the device was read, so that the focus it opens with lands on
  // the offer when there is one: a moment, the storage is local.
  if (recovery.writer.status === 'reading') {
    return null;
  }

  return (
    <StackedFormDialog
      confirmOnClose={false}
      initialFocus={recovery.offer ? recovery.focusOffer : undefined}
      open={open}
      onOpenChange={onOpenChange}
      title={
        customer
          ? t('Pages.Customers.Mutation.titleUpdate')
          : t('Pages.Customers.Mutation.titleNew')
      }
    >
      <FormRecoveryAnnouncer recovery={recovery} />
      <CustomerForm
        key={recovery.sessionKey}
        customer={customer}
        recovery={recovery}
        onCancel={() => onOpenChange(false)}
        onSuccess={onSuccess ?? (() => onOpenChange(false))}
      />
    </StackedFormDialog>
  );
}
