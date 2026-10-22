import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function AccessConfirmation({
  open,
  title,
  description,
  pending,
  error,
  onCancel,
  confirmLabel,
  destructive = false,
  children,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  error?: string;
  confirmLabel?: string;
  destructive?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !next && !pending && onCancel()}
    >
      <AlertDialogContent className="motion-reduce:animate-none motion-reduce:transition-none">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error && (
          <p
            role="alert"
            className="text-sm text-destructive-subtle-foreground"
          >
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            {t('Common.cancel')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending
              ? t('Pages.Access.saving')
              : (confirmLabel ?? t('Pages.Access.confirm'))}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
