import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormDialog } from '@/components/dialog/form-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type InvoicePreviewDialogProps = {
  /** What the preview is about, above its result: a scenario to set, a note. */
  children: ReactNode;
  description?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
};

/**
 * The modal every invoice preview shows in: a banner that says it is a preview
 * and not an invoice, whatever the caller puts above its result, and a way out.
 * A preview writes nothing, so there is no Save: closing it is the only action.
 * The caller brings the data, a mutation for a license version and a read for an
 * instance's upcoming invoice, and renders the result with
 * `InvoicePreviewResult`.
 */
export function InvoicePreviewDialog({
  children,
  description,
  onOpenChange,
  open,
  title,
}: InvoicePreviewDialogProps) {
  const { t } = useTranslation();

  return (
    <FormDialog
      className="sm:max-w-3xl"
      onOpenChange={onOpenChange}
      open={open}
    >
      <FormDialog.Header>
        <FormDialog.Title>{title}</FormDialog.Title>
        {description ? (
          <FormDialog.Description>{description}</FormDialog.Description>
        ) : null}
      </FormDialog.Header>
      <FormDialog.Content>
        <Alert>
          <Info />
          <AlertTitle>
            {t('Features.Billing.InvoicePreview.bannerTitle')}
          </AlertTitle>
          <AlertDescription>
            {t('Features.Billing.InvoicePreview.bannerDescription')}
          </AlertDescription>
        </Alert>
        {children}
      </FormDialog.Content>
      <FormDialog.Footer>
        <Button
          onClick={() => onOpenChange(false)}
          type="button"
          variant="outline"
        >
          {t('Common.close')}
        </Button>
      </FormDialog.Footer>
    </FormDialog>
  );
}
