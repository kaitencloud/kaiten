import { Suspense, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogFormSkeleton } from '@/components/dialog/dialog-form-skeleton';
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
import { useAddonPriceForm } from '../../hooks';
import type { AddonPricing } from '../../hooks';
import { AddonPriceFields } from './addon-price-fields';
import { ReplaceDefaultDialog } from './replace-default-dialog';

type AddonPriceDrawerProps = {
  /** Closes the drawer: the route drops the price it was opened on. */
  onClose: () => void;
  /** The API refused because the version cannot be changed where it is. */
  onFrozen: (error: unknown) => void;
  pricing: AddonPricing;
};

/**
 * The drawer a price is added in, which the URL opens (`?price=new`) so that it can be
 * linked to and the back button closes it. It is the form of one price and leaves the
 * tab under it as it was. A price is never edited: there is no update, and a change is
 * a new price and the deprecation of the old one.
 */
export function AddonPriceDrawer({
  onClose,
  onFrozen,
  pricing,
}: AddonPriceDrawerProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { addon } = pricing;
  const { cancelReplace, confirmReplace, failure, form, replacing } =
    useAddonPriceForm({
      addonSlug: addon.slug,
      onDone: onClose,
      onFrozen,
      pricing,
    });

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{t('Pages.Addons.Prices.Drawer.titleNew')}</SheetTitle>
          <SheetDescription>
            {t('Pages.Addons.Prices.Drawer.description', {
              name: addon.name,
              version: addon.version,
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
              <Suspense fallback={<DialogFormSkeleton fields={6} />}>
                <AddonPriceFields
                  currencyLocked={pricing.currency !== undefined}
                  flatFees={pricing.flatFees}
                  form={form}
                />
              </Suspense>
              {failure ? <ProblemAlert error={failure} /> : null}
            </div>
            <SheetFooter className="flex-row justify-end border-t">
              <Button onClick={onClose} type="button" variant="outline">
                {t('Common.cancel')}
              </Button>
              <Suspense fallback={null}>
                <form.SubmitButton
                  form={formId}
                  label={t('Pages.Addons.Prices.Drawer.create')}
                />
              </Suspense>
            </SheetFooter>
          </form.AppForm>
        </form>
        {replacing ? (
          <ReplaceDefaultDialog
            onCancel={cancelReplace}
            onConfirm={() => void confirmReplace()}
            replaced={replacing}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
