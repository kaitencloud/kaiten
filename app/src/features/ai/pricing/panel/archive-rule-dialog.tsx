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

type ArchiveRuleDialogProps = {
  /** What archiving this rule leaves the calls with. */
  consequence: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  pending: boolean;
};

/** Asked before a rule is archived: it stops pricing at once. */
export function ArchiveRuleDialog({
  consequence,
  onCancel,
  onConfirm,
  open,
  pending,
}: ArchiveRuleDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog onOpenChange={(next) => !next && onCancel()} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('AI.Panel.archive.title')}</AlertDialogTitle>
          <AlertDialogDescription>{consequence}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={onConfirm}
            variant="destructive"
          >
            {t('AI.Panel.archive.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
