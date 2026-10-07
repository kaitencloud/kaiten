import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '@/api-client';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ProblemAlert, readRecomposeRefusal } from '@/domains/billing';
import { useInvoiceMutations } from '../../hooks';

type RecomposeDialogProps = {
  invoice: Invoice;
  onClose: () => void;
  /** The invoice is not one that can be recomposed: it has to be voided first. */
  onNeedsVoid: () => void;
  /** The instance of the invoice was deleted: nothing can be recomposed for it. */
  onInstanceDeleted: () => void;
};

/**
 * Composes an invoice again from the usage journal as it is now. A held draft is
 * rewritten in place, and issued when its journal is sound; a void invoice gets a
 * replacement for the boundary it billed, which the person lands on. What the API
 * refuses with changes what is offered next: an invoice that is not a held draft
 * is voided first, a replacement that already exists is opened, and an instance
 * that was deleted ends the offer.
 */
export function RecomposeDialog({
  invoice,
  onClose,
  onInstanceDeleted,
  onNeedsVoid,
}: RecomposeDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { recompose } = useInvoiceMutations(invoice.id);
  const [failure, setFailure] = useState<unknown>(null);
  const isVoid = invoice.status === 'VOID';

  async function confirm() {
    setFailure(null);
    try {
      await recompose.mutateAsync({ path: { invoiceId: invoice.id } });
      onClose();
    } catch (error) {
      const refusal = readRecomposeRefusal(error);
      if (refusal?.kind === 'needs-void') {
        onNeedsVoid();

        return;
      }
      if (refusal?.kind === 'already-replaced') {
        onClose();
        await navigate({
          params: { invoiceId: refusal.replacementInvoiceId },
          to: '/billing/invoices/$invoiceId',
        });

        return;
      }
      if (refusal?.kind === 'instance-deleted') {
        onInstanceDeleted();
      }
      setFailure(error);
    }
  }

  return (
    <AlertDialog onOpenChange={(open) => !open && onClose()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('Pages.Billing.Invoices.Detail.Recompose.title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              isVoid
                ? 'Pages.Billing.Invoices.Detail.Recompose.descriptionVoid'
                : 'Pages.Billing.Invoices.Detail.Recompose.descriptionHeld',
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm text-muted-foreground">
          {t(
            isVoid
              ? 'Pages.Billing.Invoices.Detail.Recompose.effectVoid'
              : 'Pages.Billing.Invoices.Detail.Recompose.effectHeld',
          )}
        </p>
        {failure ? (
          <ProblemAlert
            autoFocus
            error={failure}
            onRetry={() => void confirm()}
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          {/* Not an AlertDialogAction: that one closes the dialog, and a refusal
              has to be read where it was asked for. */}
          <Button
            disabled={recompose.isPending}
            onClick={() => void confirm()}
            type="button"
          >
            {t('Pages.Billing.Invoices.Detail.Recompose.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
