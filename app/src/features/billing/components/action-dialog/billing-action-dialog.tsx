import { type ReactNode, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { FormDialog } from '@/components/dialog';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/domains/billing';

type BillingActionDialogProps = {
  /** What the dialog says and asks: the fields, in their `<form>`. */
  children: ReactNode;
  /** The confirmation, a `form.SubmitButton` of the form the dialog holds. */
  confirm: ReactNode;
  description: string;
  /** What the API refused with, when it did: shown above the buttons. */
  failure: unknown;
  /** How many field placeholders to draw while the form loads. */
  loadingFields?: number;
  onClose: () => void;
  /** Sends the form again after a refusal that changed nothing. */
  onRetry: () => void;
  title: string;
};

/**
 * The frame of the dialogs that ask the API for an audited action: a title and
 * what the action does, the fields, the refusal of the API when there is one, and
 * a Cancel beside the confirmation. The refusal takes the focus, since the
 * confirmation was disabled while the API answered and dropped it with it. The
 * form is the caller's (`useBillingActionForm`): its provider wraps this dialog.
 */
export function BillingActionDialog({
  children,
  confirm,
  description,
  failure,
  loadingFields = 3,
  onClose,
  onRetry,
  title,
}: BillingActionDialogProps) {
  const { t } = useTranslation();

  return (
    <FormDialog onOpenChange={(open) => !open && onClose()} open>
      <FormDialog.Header>
        <FormDialog.Title>{title}</FormDialog.Title>
        <FormDialog.Description>{description}</FormDialog.Description>
      </FormDialog.Header>
      <FormDialog.Content loadingFields={loadingFields}>
        {children}
        {failure ? (
          <ProblemAlert autoFocus error={failure} onRetry={onRetry} />
        ) : null}
      </FormDialog.Content>
      <FormDialog.Footer>
        <Button onClick={onClose} type="button" variant="outline">
          {t('Common.cancel')}
        </Button>
        <Suspense fallback={null}>{confirm}</Suspense>
      </FormDialog.Footer>
    </FormDialog>
  );
}
