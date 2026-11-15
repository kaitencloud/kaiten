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
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
};

/** Asked before a rule being edited is dropped by a click elsewhere on the page. */
export function DiscardChangesDialog({
  onCancel,
  onConfirm,
  open,
}: DiscardChangesDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog onOpenChange={(next) => !next && onCancel()} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('AI.Panel.discard.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('AI.Panel.discard.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('AI.Panel.discard.keep')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} variant="destructive">
            {t('AI.Panel.discard.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
