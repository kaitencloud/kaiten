import type { Component } from '@/api-client';
import { ComponentFormDialog } from '@/domains/release-management';
import type { ReleaseComponentDialogState } from './release-form-component-dialog.types';

type ReleaseFormComponentDialogHostProps = {
  componentDialog: ReleaseComponentDialogState | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: (component: Component) => void;
};

export function ReleaseFormComponentDialogHost({
  componentDialog,
  onOpenChange,
  onSuccess,
}: ReleaseFormComponentDialogHostProps) {
  return (
    <ComponentFormDialog
      key={
        componentDialog
          ? `${componentDialog.mode}-${componentDialog.mode === 'edit' ? componentDialog.componentSlug : 'create'}`
          : 'closed'
      }
      componentSlug={
        componentDialog?.mode === 'edit'
          ? componentDialog.componentSlug
          : undefined
      }
      initialValues={
        componentDialog?.mode === 'create'
          ? componentDialog.initialValues
          : componentDialog?.mode === 'edit'
            ? componentDialog.initialValues
            : undefined
      }
      mode={componentDialog?.mode === 'edit' ? 'edit' : 'create'}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      open={componentDialog !== null}
    />
  );
}
