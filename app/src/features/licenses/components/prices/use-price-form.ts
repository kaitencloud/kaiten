import { useState } from 'react';
import type { Price } from '@/api-client';
import {
  applyProblemFieldErrors,
  handleBillingProblem,
} from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import { useLicensePriceMutations } from '../../hooks/use-license-price-mutations';
import type { useLicensePricing } from '../../hooks/use-license-pricing';
import {
  initialLicensePriceFormValues,
  priceFormValuesToCreateBody,
  priceFormValuesToUpdateBody,
  priceToFormValues,
} from '../../schemas/license-price.schema';
import { getVersionFreezeReason } from '../../utils/license-freeze.utils';
import {
  getDefaultPrice,
  getNextDisplayOrder,
} from '../../utils/license-price.utils';
import { priceFormOpts } from './price-form-options';

// Where a field error of the API lands in the form, by the name the API gives the
// member (`body.unitAmountDecimal`): the amount is typed under another name than it
// is sent under.
const FIELDS_BY_LOCATION = {
  billingPeriod: 'billingPeriod',
  billingTiming: 'billingTiming',
  currency: 'currency',
  displayLabel: 'displayLabel',
  isDefault: 'isDefault',
  meteredEntitlementSlug: 'meteredEntitlementSlug',
  unitAmountDecimal: 'amount',
};

type UsePriceFormOptions = {
  /**
   * Called when the API refuses because the version cannot be changed where it
   * is (billed, published, archived), with what it refused with: there is
   * nothing to correct in the form, and a new version is the way.
   */
  onFrozen: (error: unknown) => void;
  /** Called once the API accepted the price. */
  onDone: () => void;
  /** The price being edited; a new one when left out. */
  price?: Price;
  pricing: Pick<ReturnType<typeof useLicensePricing>, 'currency' | 'prices'>;
  licenseSlug: string;
};

/**
 * The form of a price, new or edited. It sends what the API takes (the amount in
 * minor units, the display order after the version's last price) and shows what
 * the API refuses with: the field errors it names on their fields, anything else
 * as its own explanation above the buttons, with the form left as it was typed.
 * A new price starts in the currency of the version when it has one, and as the
 * default of its period when the version has none yet.
 */
export function usePriceForm({
  licenseSlug,
  onDone,
  onFrozen,
  price,
  pricing,
}: UsePriceFormOptions) {
  const { create, update } = useLicensePriceMutations(licenseSlug);
  const [failure, setFailure] = useState<unknown>(null);

  const form = useAppForm({
    ...priceFormOpts,
    defaultValues: price
      ? priceToFormValues(price)
      : initialLicensePriceFormValues(
          pricing.currency ?? 'USD',
          getDefaultPrice(pricing.prices, 'MONTHLY') === undefined,
        ),
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      try {
        if (price) {
          await update.mutateAsync({
            body: priceFormValuesToUpdateBody(value),
            path: { licenseSlug, priceId: price.id },
          });
        } else {
          await create.mutateAsync({
            body: priceFormValuesToCreateBody(
              value,
              getNextDisplayOrder(pricing.prices),
            ),
            path: { licenseSlug },
          });
        }
        onDone();
      } catch (error) {
        const problem = handleBillingProblem(error);
        if (getVersionFreezeReason(problem.code)) {
          onFrozen(error);

          return;
        }
        if (!applyProblemFieldErrors(formApi, problem, FIELDS_BY_LOCATION)) {
          setFailure(error);
        }
      }
    },
  });

  return { failure, form, isEditing: price !== undefined };
}
