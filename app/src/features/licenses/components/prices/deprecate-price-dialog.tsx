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
import { ProblemAlert } from '@/domains/billing';
import { useLicensePriceMutations } from '../../hooks/use-license-price-mutations';

type DeprecatePriceDialogProps = {
  licenseSlug: string;
  /** The label the price is called by on screen. */
  label: string;
  onClose: () => void;
  price: Price;
};

/**
 * Asks before a price is deprecated, which cannot be undone. The text says what
 * deprecating changes and what it does not: subscriptions pinned to the price
 * keep being billed from it, it is no longer offered to new subscriptions or to
 * a plan change, a metered price produces no line from the next invoice, and a
 * default price stops being the default in the same write. A refusal of the API
 * shows in the dialog, which stays open.
 */
export function DeprecatePriceDialog({
  label,
  licenseSlug,
  onClose,
  price,
}: DeprecatePriceDialogProps) {
  const { t } = useTranslation();
  const { deprecate } = useLicensePriceMutations(licenseSlug);
  const [error, setError] = useState<unknown>(null);

  async function confirm() {
    setError(null);
    try {
      await deprecate.mutateAsync({
        path: { licenseSlug, priceId: price.id },
      });
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
            {t('Pages.Licenses.Prices.Deprecate.title', { label })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              price.metered
                ? 'Pages.Licenses.Prices.Deprecate.descriptionMetered'
                : 'Pages.Licenses.Prices.Deprecate.descriptionFlat',
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {price.isDefault ? (
          <p className="text-sm">
            {t('Pages.Licenses.Prices.Deprecate.defaultNote')}
          </p>
        ) : null}
        {error ? <ProblemAlert error={error} onRetry={confirm} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          {/* Not an AlertDialogAction: that one closes the dialog, and a refusal
              has to be read where it was asked for. */}
          <Button
            disabled={deprecate.isPending}
            onClick={confirm}
            type="button"
            variant="destructive"
          >
            {t('Pages.Licenses.Prices.Deprecate.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
