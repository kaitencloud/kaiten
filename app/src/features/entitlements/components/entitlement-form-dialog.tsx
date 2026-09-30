import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import { EntitlementForm } from './entitlement-form';

type EntitlementFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entitlement?: Entitlement;
  onSuccess?: (entitlement: Entitlement) => void;
};

export function EntitlementFormDialog({
  open,
  onOpenChange,
  entitlement,
  onSuccess,
}: EntitlementFormDialogProps) {
  const { t } = useTranslation();

  return (
    <StackedFormDialog
      stacked
      loadingFields={4}
      className="sm:max-w-lg"
      confirmOnClose={false}
      open={open}
      onOpenChange={onOpenChange}
      title={
        entitlement
          ? t('Pages.Entitlements.Mutation.titleUpdate')
          : t('Pages.Entitlements.Mutation.titleNew')
      }
    >
      <EntitlementForm
        entitlement={entitlement}
        layout="dialog"
        onCancel={() => onOpenChange(false)}
        onSuccess={onSuccess ?? (() => onOpenChange(false))}
      />
    </StackedFormDialog>
  );
}
