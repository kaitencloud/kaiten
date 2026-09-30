import { Trash2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export interface DeleteConfirmationDialogProps {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** Keeps the destructive action out of reach, e.g. while a precondition is
   * still being checked or has failed; the description says why. */
  confirmDisabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DeleteConfirmationDialog({
  trigger,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  confirmDisabled,
  onOpenChange,
}: DeleteConfirmationDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader className="w-full min-w-0">
          <AlertDialogMedia className="bg-destructive-subtle text-destructive-subtle-foreground">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="w-full min-w-0 max-w-full whitespace-normal wrap-anywhere text-center">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
