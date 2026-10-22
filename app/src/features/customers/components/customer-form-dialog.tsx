import { useTranslation } from 'react-i18next';
import type { Customer } from '@/api-client';
import { useActionAccess, useLeaveRestrictedDialog } from '@/domains/billing';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import { CustomerForm } from './customer-form';

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
  const { t } = useTranslation();
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
    <StackedFormDialog
      confirmOnClose={false}
      open={open}
      onOpenChange={onOpenChange}
      title={
        customer
          ? t('Pages.Customers.Mutation.titleUpdate')
          : t('Pages.Customers.Mutation.titleNew')
      }
    >
      <CustomerForm
        customer={customer}
        onCancel={() => onOpenChange(false)}
        onSuccess={onSuccess ?? (() => onOpenChange(false))}
      />
    </StackedFormDialog>
  );
}
