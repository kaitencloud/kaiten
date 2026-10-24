import { z } from 'zod';
import type { NewAddonPrice } from '@/api-client';
import { zNewAddonPrice } from '@/api-client/zod.gen';
import { isMeteredModel } from '@/domains/billing';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import { isValidMajorAmount, majorToMinorDecimal } from '@/lib/money';

/**
 * The form of a price of an add-on. It starts from what the API declares of a new price
 * (shape, period, timing, currency, label and meter) and adds what only the form has:
 * the amount as it is typed, in major units, which becomes the `unitAmountDecimal` the
 * API takes, in minor ones, when the form is sent. A price is a flat fee, which bills a
 * period, or a metered one, which rates what an entitlement the version grants measured:
 * which fields it needs depends on that, so the rules that tie them are checked
 * together, each message a translation key placed on its field.
 */
export const addonPriceFormSchema = zNewAddonPrice
  .pick({
    billingModel: true,
    billingPeriod: true,
    billingTiming: true,
    currency: true,
  })
  .extend({
    amount: z.string(),
    billingPeriod: zNewAddonPrice.shape.billingPeriod.unwrap(),
    billingTiming: zNewAddonPrice.shape.billingTiming.unwrap(),
    // What the form holds is never missing: empty stands for nothing chosen.
    displayLabel: z.string().max(200, 'Pages.Addons.Prices.Form.Errors.label'),
    isDefault: z.boolean(),
    meteredEntitlementSlug: z.string(),
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
    if (
      isMeteredModel(values.billingModel) &&
      values.meteredEntitlementSlug === ''
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pages.Addons.Prices.Form.Errors.meter',
        path: ['meteredEntitlementSlug'],
      });
    }
  });

export type AddonPriceFormValues = z.infer<typeof addonPriceFormSchema>;

/**
 * What a new price starts as: a flat fee, monthly, in advance, in the currency of the
 * version. The default of its period when the period has none yet, since a priced
 * add-on with no default for the period is refused on a subscription of it.
 */
export const initialAddonPriceFormValues = (
  currency: string,
  isDefault: boolean,
): AddonPriceFormValues => ({
  amount: '',
  billingModel: 'FLAT_FEE',
  billingPeriod: 'MONTHLY',
  billingTiming: 'ADVANCE',
  currency,
  displayLabel: '',
  isDefault,
  meteredEntitlementSlug: '',
});

/** A label left empty is left to the API, which derives one. */
const toOptionalLabel = (label: string): string | undefined =>
  label.trim() || undefined;

/**
 * The body of a new price, its amount in minor units, and the display order after the
 * last price of the version. A metered price is billed in arrears and has no period,
 * whatever the form kept of the shape it was switched from, and only a flat fee is a
 * default.
 */
export function addonPriceFormValuesToCreateBody(
  values: AddonPriceFormValues,
  displayOrder: number | undefined,
): NewAddonPrice {
  const metered = isMeteredModel(values.billingModel);

  return {
    billingModel: values.billingModel,
    billingPeriod: metered ? undefined : values.billingPeriod,
    billingTiming: metered ? 'ARREARS' : values.billingTiming,
    currency: values.currency,
    displayLabel: toOptionalLabel(values.displayLabel),
    displayOrder,
    isDefault: metered ? undefined : values.isDefault,
    meteredEntitlementSlug: metered ? values.meteredEntitlementSlug : undefined,
    unitAmountDecimal:
      majorToMinorDecimal(values.amount, values.currency) ?? values.amount,
  };
}
