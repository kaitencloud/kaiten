import { useState } from 'react';
import type { Price } from '@/api-client';
import { handleBillingProblem, placeRefusalOnFields } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import {
  addonPriceFormValuesToCreateBody,
  initialAddonPriceFormValues,
} from '../schemas';
import { addonPriceFormOpts } from '../schemas/addon-price-form-options';
import { getAddonFreezeReason } from '../utils/addon-freeze.utils';
import {
  getDefaultPrice,
  getNextDisplayOrder,
} from '../utils/addon-price.utils';
import { useAddonPriceMutations } from './use-addon-price-mutations';
import type { AddonPricing } from './use-addon-pricing';

// Where a refusal of the API lands in the form: by the name the API gives the member
// (`body.unitAmountDecimal`, since the amount is typed under another name than it is
// sent under), and by its code for the ones that say the field in prose.
const REFUSAL_FIELDS = {
  byCode: {
    'CreateAddonPrice.CurrencyMismatch': 'currency',
  },
  byLocation: {
    billingPeriod: 'billingPeriod',
    billingTiming: 'billingTiming',
    currency: 'currency',
    displayLabel: 'displayLabel',
    isDefault: 'isDefault',
    unitAmountDecimal: 'amount',
  },
} as const;

type UseAddonPriceFormOptions = {
  addonSlug: string;
  /**
   * Called when the API refuses because the version cannot be changed where it is
   * (billed, archived), with what it refused with: there is nothing to correct in the
   * form, and a new version is the way.
   */
  onFrozen: (error: unknown) => void;
  /** Called once the API accepted the price. */
  onDone: () => void;
  pricing: Pick<AddonPricing, 'currency' | 'flatFees' | 'prices'>;
};

/**
 * The form of a new price, and the request it sends. It sends what the API takes -- a
 * flat fee, its amount in minor units, the display order after the version's last
 * price -- and shows what the API refuses with: the field errors it names on their
 * fields, a version that can no longer be changed as the way to a new one, anything
 * else above the buttons, with the form left as it was typed.
 *
 * A price made the default of its period takes the place of the one that was, in
 * silence: the API clears the flag of the old one in the same write. So the form
 * asks first, naming the price that is replaced, and sends nothing until the answer
 * is yes (`replacing` is that question; `confirmReplace` its answer).
 */
export function useAddonPriceForm({
  addonSlug,
  onDone,
  onFrozen,
  pricing,
}: UseAddonPriceFormOptions) {
  const { create } = useAddonPriceMutations(addonSlug);
  const [failure, setFailure] = useState<unknown>(null);
  const [replacing, setReplacing] = useState<Price | null>(null);

  const form = useAppForm({
    ...addonPriceFormOpts,
    defaultValues: initialAddonPriceFormValues(
      pricing.currency ?? 'USD',
      // The first price of a period is the one that bills it: a priced add-on with no
      // default for the period is refused on a subscription of it.
      getDefaultPrice(pricing.flatFees, 'MONTHLY') === undefined,
    ),
    onSubmit: ({ value }) => {
      const replaced = value.isDefault
        ? getDefaultPrice(pricing.flatFees, value.billingPeriod)
        : undefined;
      if (replaced) {
        setReplacing(replaced);

        return undefined;
      }

      return send();
    },
  });

  // Sends what the form holds. It reads the form when it is called, so that the
  // confirmation of a replaced default sends what was typed, as the form submits it.
  async function send() {
    setFailure(null);
    try {
      await create.mutateAsync({
        body: addonPriceFormValuesToCreateBody(
          form.state.values,
          getNextDisplayOrder(pricing.prices),
        ),
        path: { addonSlug },
      });
      onDone();
    } catch (error) {
      if (getAddonFreezeReason(handleBillingProblem(error).code)) {
        onFrozen(error);

        return;
      }
      if (!placeRefusalOnFields(form, error, REFUSAL_FIELDS)) {
        setFailure(error);
      }
    }
  }

  return {
    cancelReplace: () => setReplacing(null),
    confirmReplace: async () => {
      setReplacing(null);
      await send();
    },
    failure,
    form,
    isPending: create.isPending,
    replacing,
  };
}
