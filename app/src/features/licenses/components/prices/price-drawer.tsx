import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Price } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ProblemAlert } from '@/domains/billing';
import { createFormSubmitHandler } from '@/hooks/form';
import type { useLicensePricing } from '../../hooks/use-license-pricing';
import { PriceAmountSection } from './price-amount-section';
import { PriceDetailsSection } from './price-details-section';
import { PriceShapeSection } from './price-shape-section';
import { usePriceForm } from './use-price-form';

type PriceDrawerProps = {
  licenseSlug: string;
  /** Closes the drawer: the route drops the price it was opened on. */
  onClose: () => void;
  /** The API refused because the version cannot be changed where it is. */
  onFrozen: (error: unknown) => void;
  /** The price being edited; a new one when left out. */
  price?: Price;
  pricing: ReturnType<typeof useLicensePricing>;
};

/**
 * The drawer a price is added or edited in, which the URL opens
 * (`?price=new`, `?price=<id>`) so that it can be linked to and the back button
 * closes it. It is the form of one price and leaves the tab under it as it was.
 */
export function PriceDrawer({
  licenseSlug,
  onClose,
  onFrozen,
  price,
  pricing,
}: PriceDrawerProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { failure, form, isEditing } = usePriceForm({
    licenseSlug,
    onDone: onClose,
    onFrozen,
    price,
    pricing,
  });
  const source = {
    editingPriceId: price?.id,
    entitlements: pricing.entitlements,
    grants: pricing.grants,
    prices: pricing.prices,
  };
  const { license } = pricing;

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>
            {isEditing
              ? t('Pages.Licenses.Prices.Drawer.titleEdit')
              : t('Pages.Licenses.Prices.Drawer.titleNew')}
          </SheetTitle>
          <SheetDescription>
            {t('Pages.Licenses.Prices.Drawer.description', {
              name: license.name,
              version: license.version,
            })}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          id={formId}
          onSubmit={createFormSubmitHandler(form.handleSubmit)}
        >
          <form.AppForm>
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <PriceShapeSection
                form={form}
                isEditing={isEditing}
                source={source}
              />
              <PriceDetailsSection
                currencyLocked={pricing.currency !== undefined}
                form={form}
              />
              <PriceAmountSection form={form} source={source} />
              {failure ? <ProblemAlert error={failure} /> : null}
            </div>
            <SheetFooter className="flex-row justify-end border-t">
              <Button onClick={onClose} type="button" variant="outline">
                {t('Common.cancel')}
              </Button>
              <form.SubmitButton
                form={formId}
                label={
                  isEditing
                    ? t('Pages.Licenses.Prices.Drawer.update')
                    : t('Pages.Licenses.Prices.Drawer.create')
                }
              />
            </SheetFooter>
          </form.AppForm>
        </form>
      </SheetContent>
    </Sheet>
  );
}
