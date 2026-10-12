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

type LeaveWithoutKeyDialogProps = {
  onLeave: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

/**
 * Asked when the dialog of a key that was just issued is dismissed by Escape, a click
 * outside or the close button before the key was copied: the API keeps only a digest, so
 * closing is losing the key for good, and a gesture made by accident must not do that.
 * Cancelling leads back to the key; the Done button of the dialog closes without asking.
 */
export function LeaveWithoutKeyDialog({
  onLeave,
  onOpenChange,
  open,
}: LeaveWithoutKeyDialogProps) {
  const { t } = useTranslation();
  const base = 'Pages.Integrations.PublishableKeys.Create.Created.Leave';

  return (
    // Above the dialog it was asked from, as the discard confirmation of the form dialogs is.
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent className="z-100" size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`${base}.title`)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(`${base}.description`)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="created-key-stay" variant="outline">
            {t(`${base}.stay`)}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="created-key-leave"
            onClick={onLeave}
            variant="destructive"
          >
            {t(`${base}.leave`)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
