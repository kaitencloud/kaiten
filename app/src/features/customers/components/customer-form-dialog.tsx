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
