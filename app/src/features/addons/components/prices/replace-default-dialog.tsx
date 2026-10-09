import { useTranslation } from 'react-i18next';
import type { Price } from '@/api-client';
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
import {
  BILLING_PERIOD_LABEL_KEYS,
  getPriceAmountParts,
  getPriceLabel,
  joinPriceAmount,
} from '@/domains/billing';

type ReplaceDefaultDialogProps = {
  /** Called when the person says no: the form is as it was. */
  onCancel: () => void;
  /** Called when the person says yes: the price is sent. */
  onConfirm: () => void;
  /** The default price of the period that the new one takes the place of. */
  replaced: Price;
};

/**
 * Asks before a price takes the place of the default of its period. The API does it in
 * silence: it clears the flag of the old default in the same write as it creates the
 * new one. The old price stays, active and listed, and can be deprecated once it is not
 * the default; what changes is the price that bills the subscriptions of that period.
 */
export function ReplaceDefaultDialog({
  onCancel,
  onConfirm,
  replaced,
}: ReplaceDefaultDialogProps) {
  const { i18n, t } = useTranslation();
  const label = getPriceLabel(replaced, undefined, t);
  const period = replaced.billingPeriod
    ? t(BILLING_PERIOD_LABEL_KEYS[replaced.billingPeriod]).toLowerCase()
    : '';

  return (
    <AlertDialog onOpenChange={(open) => !open && onCancel()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('Pages.Addons.Prices.ReplaceDefault.title', { period })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('Pages.Addons.Prices.ReplaceDefault.description', {
              label,
              period,
              price: joinPriceAmount(
                getPriceAmountParts(replaced, undefined, t, i18n.language),
              ),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          <Button onClick={onConfirm} type="button">
            {t('Pages.Addons.Prices.ReplaceDefault.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
