import { useState } from 'react';
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
import { getPriceLabel, ProblemAlert } from '@/domains/billing';
import { useAddonPriceMutations } from '../../hooks';

type DeprecateAddonPriceDialogProps = {
  addonSlug: string;
  onClose: () => void;
  price: Price;
};

/**
 * Asks before a price is deprecated, which cannot be undone. The text says what
 * deprecating changes and what it does not: an instance already billed from the price
 * keeps being billed from it, and it is no longer offered. The default price of a
 * period is never deprecated here -- the API refuses it, and the button is disabled --
 * so a refusal that does come is read in the dialog, which stays open.
 */
export function DeprecateAddonPriceDialog({
  addonSlug,
  onClose,
  price,
}: DeprecateAddonPriceDialogProps) {
  const { t } = useTranslation();
  const { deprecate } = useAddonPriceMutations(addonSlug);
  const [error, setError] = useState<unknown>(null);
  const label = getPriceLabel(price, undefined, t);

  async function confirm() {
    setError(null);
    try {
      await deprecate.mutateAsync({ path: { addonSlug, priceId: price.id } });
      onClose();
    } catch (failure) {
      setError(failure);
    }
  }

  return (
    <AlertDialog onOpenChange={(open) => !open && onClose()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('Pages.Addons.Prices.Deprecate.title', { label })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('Pages.Addons.Prices.Deprecate.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <ProblemAlert error={error} onRetry={confirm} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          {/* Not an AlertDialogAction: that one closes the dialog, and a refusal has to
              be read where it was asked for. */}
          <Button
            disabled={deprecate.isPending}
            onClick={confirm}
            type="button"
            variant="destructive"
          >
            {t('Pages.Addons.Prices.Deprecate.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
