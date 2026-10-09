import { z } from 'zod';
import type { NewAddonPrice } from '@/api-client';
import { zNewAddonPrice } from '@/api-client/zod.gen';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import { isValidMajorAmount, majorToMinorDecimal } from '@/lib/money';

/**
 * The form of a price of an add-on. A price is a flat fee: the API takes a metered
 * one on a version and never values it, so the form has no shape to choose. It
 * starts from what the API declares of a new price (period, timing, currency,
 * label) and adds what only the form has: the amount as it is typed, in major
 * units, which becomes the `unitAmountDecimal` the API takes, in minor ones, when
 * the form is sent. Each message is a translation key placed on its field.
 */
export const addonPriceFormSchema = zNewAddonPrice
  .pick({ billingPeriod: true, billingTiming: true, currency: true })
  .extend({
    amount: z.string(),
    billingPeriod: zNewAddonPrice.shape.billingPeriod.unwrap(),
    billingTiming: zNewAddonPrice.shape.billingTiming.unwrap(),
    // What the form holds is never missing: empty stands for nothing chosen.
    displayLabel: z.string().max(200, 'Pages.Addons.Prices.Form.Errors.label'),
    isDefault: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (!CURRENCY_EXPONENTS.has(values.currency)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pages.Addons.Prices.Form.Errors.currency',
        path: ['currency'],
      });
    }
    if (!isValidMajorAmount(values.amount, values.currency)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pages.Addons.Prices.Form.Errors.amount',
        path: ['amount'],
      });
    }
  });

export type AddonPriceFormValues = z.infer<typeof addonPriceFormSchema>;

/**
 * What a new price starts as: monthly, in advance, in the currency of the version.
 * The default of its period when the period has none yet, since a priced add-on
 * with no default for the period is refused on a subscription of it.
 */
export const initialAddonPriceFormValues = (
  currency: string,
  isDefault: boolean,
): AddonPriceFormValues => ({
  amount: '',
  billingPeriod: 'MONTHLY',
  billingTiming: 'ADVANCE',
  currency,
  displayLabel: '',
  isDefault,
});

/** A label left empty is left to the API, which derives one. */
const toOptionalLabel = (label: string): string | undefined =>
  label.trim() || undefined;

/**
 * The body of a new price: a flat fee, its amount in minor units, and the display
 * order after the last price of the version.
 */
export function addonPriceFormValuesToCreateBody(
  values: AddonPriceFormValues,
  displayOrder: number | undefined,
): NewAddonPrice {
  return {
    billingModel: 'FLAT_FEE',
    billingPeriod: values.billingPeriod,
    billingTiming: values.billingTiming,
    currency: values.currency,
    displayLabel: toOptionalLabel(values.displayLabel),
    displayOrder,
    isDefault: values.isDefault,
    unitAmountDecimal:
      majorToMinorDecimal(values.amount, values.currency) ?? values.amount,
  };
}
