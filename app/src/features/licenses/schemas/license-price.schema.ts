import { z } from 'zod';
import type { LicensePriceChanges, NewLicensePrice, Price } from '@/api-client';
import { zNewLicensePrice } from '@/api-client/zod.gen';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import {
  isValidMajorAmount,
  majorToMinorDecimal,
  minorToMajorDecimal,
} from '@/lib/money';
import { isMeteredModel } from '../utils/license-price.utils';

/**
 * The form of a price. It starts from what the API declares of a new price (its
 * model, period, timing, currency, label and meter), and adds what only the form
 * has: the amount as it is typed, in major units, which becomes the
 * `unitAmountDecimal` the API takes, in minor ones, when the form is sent.
 * Which fields a price needs depends on its model, so the rules that tie them
 * are checked together, each message a translation key placed on its field.
 */
export const licensePriceFormSchema = zNewLicensePrice
  .pick({
    billingModel: true,
    billingPeriod: true,
    billingTiming: true,
    currency: true,
    displayLabel: true,
    meteredEntitlementSlug: true,
  })
  .extend({
    amount: z.string(),
    // What the form holds is never missing: empty stands for nothing chosen.
    displayLabel: z
      .string()
      .max(200, 'Pages.Licenses.Prices.Form.Errors.label'),
    isDefault: z.boolean(),
    meteredEntitlementSlug: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!CURRENCY_EXPONENTS.has(values.currency)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pages.Licenses.Prices.Form.Errors.currency',
        path: ['currency'],
      });
    }
    if (!isValidMajorAmount(values.amount, values.currency)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pages.Licenses.Prices.Form.Errors.amount',
        path: ['amount'],
      });
    }
    if (isMeteredModel(values.billingModel)) {
      if (values.meteredEntitlementSlug === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'Pages.Licenses.Prices.Form.Errors.meter',
          path: ['meteredEntitlementSlug'],
        });
      }
    } else if (values.billingPeriod === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pages.Licenses.Prices.Form.Errors.period',
        path: ['billingPeriod'],
      });
    }
  });

export type LicensePriceFormValues = z.infer<typeof licensePriceFormSchema>;

/** What a new price starts as: a flat fee, monthly, in advance. */
export const initialLicensePriceFormValues = (
  currency: string,
  isDefault: boolean,
): LicensePriceFormValues => ({
  amount: '',
  billingModel: 'FLAT_FEE',
  billingPeriod: 'MONTHLY',
  billingTiming: 'ADVANCE',
  currency,
  displayLabel: '',
  isDefault,
  meteredEntitlementSlug: '',
});

/** The values of the form of an existing price, its amount in major units. */
export function priceToFormValues(price: Price): LicensePriceFormValues {
  return {
    amount: minorToMajorDecimal(price.unitAmountDecimal, price.currency) ?? '',
    billingModel: price.billingModel,
    billingPeriod: price.billingPeriod ?? undefined,
    billingTiming: price.billingTiming,
    currency: price.currency,
    displayLabel: price.displayLabel ?? '',
    isDefault: price.isDefault,
    meteredEntitlementSlug: price.metered?.entitlementSlug ?? '',
  };
}

/** A label left empty is left to the API, which derives one. */
const toOptionalLabel = (label: string) => label.trim() || undefined;

/**
 * The body of a new price. A metered price is billed in arrears and has no
 * period, whatever the form kept of the model it was switched from, and only a
 * flat fee is a default.
 */
export function priceFormValuesToCreateBody(
  values: LicensePriceFormValues,
  displayOrder: number | undefined,
): NewLicensePrice {
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

/**
 * The changes an edit sends: what the API lets an update touch, which is
 * everything but the model and the currency. A label emptied is sent as the empty
 * string, which clears it; leaving it out would keep it.
 */
export function priceFormValuesToUpdateBody(
  values: LicensePriceFormValues,
): LicensePriceChanges {
  const metered = isMeteredModel(values.billingModel);

  return {
    billingPeriod: metered ? undefined : values.billingPeriod,
    billingTiming: metered ? 'ARREARS' : values.billingTiming,
    displayLabel: values.displayLabel.trim(),
    isDefault: metered ? undefined : values.isDefault,
    meteredEntitlementSlug: metered ? values.meteredEntitlementSlug : undefined,
    unitAmountDecimal:
      majorToMinorDecimal(values.amount, values.currency) ?? values.amount,
  };
}
