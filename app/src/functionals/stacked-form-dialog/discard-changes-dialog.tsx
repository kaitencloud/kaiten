import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type DiscardChangesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/**
 * Confirmation shown when the user tries to close a form dialog with pending
 * changes. Extracted from `StackedFormDialog` to keep that file within the
 * per-file size budget.
 */
export function DiscardChangesDialog({
  open,
  onOpenChange,
  onConfirm,
}: DiscardChangesDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm" className="z-100">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('Common.discardFormChangesTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('Common.discardFormChangesDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t('Common.discardFormChangesConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
