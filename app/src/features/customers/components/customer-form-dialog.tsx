import { useTranslation } from 'react-i18next';
import type { Customer } from '@/api-client';
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

  return (
    <StackedFormDialog
      finalFocus={() => {
        // Closing a route dialog replaces its opener's DOM node. Restore the
        // equivalent list action after the navigation has committed.
        requestAnimationFrame(() => document.querySelector<HTMLAnchorElement>('a[href="/customers/new"]')?.focus());
        return false;
      }}
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
