import { useTranslation } from 'react-i18next';
import type { Variant } from '@/api-client';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Targeting } from '../types';
import { TargetingFormDialog } from './targeting-form-dialog';

type TargetingEditDialogProps = {
  editingIndex: number | null;
  onClose: () => void;
  onSubmit: (index: number, targeting: Targeting) => void;
  targetings: Targeting[];
  variants: Variant[];
  disableCelValidation?: boolean;
};

type TargetingDeleteDialogProps = {
  deletingIndex: number | null;
  onClose: () => void;
  onConfirm: (index: number) => void;
};

export function TargetingEditDialog({
  editingIndex,
  onClose,
  onSubmit,
  targetings,
  variants,
  disableCelValidation = false,
}: TargetingEditDialogProps) {
  if (editingIndex === null) {
    return null;
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      onClose();
    }
  }

  function handleSubmit(targeting: Targeting) {
    if (editingIndex === null) {
      return;
    }

    onSubmit(editingIndex, targeting);
  }

  return (
    <TargetingFormDialog
      open
      onOpenChange={handleOpenChange}
      variants={variants}
      onSubmit={handleSubmit}
      targeting={targetings[editingIndex]}
      mode="edit"
      disableCelValidation={disableCelValidation}
    />
  );
}

export function TargetingDeleteDialog({
  deletingIndex,
  onClose,
  onConfirm,
}: TargetingDeleteDialogProps) {
  const { t } = useTranslation();

  function handleOpenChange(open: boolean) {
    if (!open) {
      onClose();
    }
  }

  function handleConfirm() {
    if (deletingIndex !== null) {
      onConfirm(deletingIndex);
    }
  }

  return (
    <AlertDialog open={deletingIndex !== null} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('Features.Targeting.List.deleteConfirmTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('Features.Targeting.List.deleteConfirmDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Common.cancel')}</AlertDialogCancel>
          <AlertDialogClose
            render={
              <AlertDialogAction onClick={handleConfirm}>
                {t('Common.delete')}
              </AlertDialogAction>
            }
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
