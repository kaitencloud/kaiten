import { useTranslation } from 'react-i18next';
import type { Instance } from '@/api-client';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import { InstanceForm, type LockedCustomer } from './instance-form';

type InstanceFormDialogProps = {
  instance?: Instance;
  lockedCustomer?: LockedCustomer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (instance: Instance) => void;
};

export function InstanceFormDialog({
  instance,
  lockedCustomer,
  open,
  onOpenChange,
  onSuccess,
}: InstanceFormDialogProps) {
  const { t } = useTranslation();

  return (
    <StackedFormDialog
      stacked
      loadingFields={3}
      className="max-w-[min(96vw,1400px)]"
      open={open}
      onOpenChange={onOpenChange}
      title={
        instance
          ? t('Pages.Customers.Instances.Mutation.titleUpdate')
          : t('Pages.Customers.Instances.Mutation.titleNew')
      }
    >
      <InstanceForm
        instance={instance}
        lockedCustomer={lockedCustomer}
        onSuccess={onSuccess ?? (() => onOpenChange(false))}
        stackOrientation="bottom-right"
      />
    </StackedFormDialog>
  );
}
