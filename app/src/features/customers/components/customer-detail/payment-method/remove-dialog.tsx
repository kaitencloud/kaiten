import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { getProblemCode, ProblemAlert } from '@/domains/billing';

type RemoveDialogProps = {
  onClose: () => void;
  /** Removes the payment method. It throws what the API refused with. */
  onConfirm: () => Promise<unknown>;
};

/**
 * Asks before the payment method of a customer is removed from Stripe: Stripe can no
 * longer charge the customer, which the contracts that send the invoice never needed.
 * The API refuses while a live contract of the customer is charged automatically, and the
 * dialog then stays open on its words with what to do first: switch those contracts to
 * sending the invoice, in the Billing tab of their instance. A card removed while the
 * dialog was open is a refusal too, and is shown as it is.
 */
export function RemoveDialog({ onClose, onConfirm }: RemoveDialogProps) {
  const { t } = useTranslation();
  const [failure, setFailure] = useState<unknown>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const base = 'Pages.Customers.Detail.paymentMethod.Remove';

  async function remove() {
    setFailure(null);
    setIsRemoving(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      setFailure(error);
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <AlertDialog onOpenChange={(open) => !open && onClose()} open>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive-subtle text-destructive-subtle-foreground">
            <Trash2 className="size-5" />
          </AlertDialogMedia>
          <AlertDialogTitle>{t(`${base}.title`)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(`${base}.description`)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? (
          <div
            className="space-y-3"
            data-testid="payment-method-remove-refused"
          >
            <ProblemAlert
              autoFocus
              error={failure}
              onRetry={() => void remove()}
            />
            {getProblemCode(failure) ===
            'DetachPaymentMethod.InUseByAutomaticCollection' ? (
              <p className="text-sm">{t(`${base}.inUse`)}</p>
            ) : null}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          <Button
            disabled={isRemoving}
            onClick={() => void remove()}
            variant="destructive"
          >
            {t(`${base}.confirm`)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
