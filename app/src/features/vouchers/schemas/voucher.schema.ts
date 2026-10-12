import { z } from 'zod';
import { zGrant, zVoucherDraft } from '@/api-client/zod.gen';
import { majorToMinorDecimal } from '@/lib/money';

/** The largest count the API takes: an int32. */
const INT32_MAX = 2_147_483_647;

export const NAME_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

/** A code is 8 to 64 of letters, digits, `_` and `-` (`CreateVoucher.InvalidCode`). */
export const CODE_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const ERRORS = 'Pages.Vouchers.Wizard.Errors';

/** The modifiers of a boost, and what each takes of a value (`CreateVoucher.InvalidGrant`). */
export const MODIFIER_TYPES = [
  'SET',
  'ADD',
  'MULTIPLY',
  'UNLIMITED',
] as const satisfies readonly z.infer<typeof zGrant>['modifierType'][];

/** A whole number from one up, or nothing: an empty number field is `NaN`. */
const optionalCount = (error: string) =>
  z.custom<number>(
    (count) =>
      typeof count === 'number' &&
      (Number.isNaN(count) ||
        (Number.isInteger(count) && count >= 1 && count <= INT32_MAX)),
    { error },
  );

/** One change of a boost, as the form holds it: the value is the text typed. */
export const grantFormSchema = z.object({
  entitlementSlug: z.string(),
  // What tells the row from the others as the person adds and takes away: never sent.
  key: z.string(),
  modifierType: z.enum(MODIFIER_TYPES),
  modifierValue: z.string(),
});

export type GrantFormValues = z.infer<typeof grantFormSchema>;

let grantCount = 0;

/** A row of changes for a boost that has none yet: nothing chosen, to add something to. */
export function newGrant(): GrantFormValues {
  grantCount += 1;

  return {
    entitlementSlug: '',
    key: `grant-${grantCount}`,
    modifierType: 'ADD',
    modifierValue: '',
  };
}

/**
 * The form of a voucher, as the wizard holds it: the members of the body of a new
 * voucher, with a number kept as the text typed (a percentage, an amount in major
 * units, the value of a modifier) so that none goes through a float, an empty text
 * for what is left out, and an empty number as `NaN`. The one member the body has and
 * the form has not is the minimum amount of the rules, which the form keeps as an
 * amount and a currency of its own.
 */
export const voucherFormSchema = zVoucherDraft
  .pick({ voucherType: true })
  .extend({
    amount: z.string(),
    annualOnly: z.boolean(),
    applicableAddonIds: z.array(z.string()),
    applicableAddonPriceIds: z.array(z.string()),
    applicableLicenseIds: z.array(z.string()),
    applicableLicensePriceIds: z.array(z.string()),
    // Left empty, the API generates one: 16 characters, 80 random bits.
    code: z.string(),
    currency: z.string(),
    description: z
      .string()
      .max(DESCRIPTION_MAX_LENGTH, `${ERRORS}.descriptionTooLong`),
    duration: zVoucherDraft.shape.duration,
    durationInPeriods: optionalCount(`${ERRORS}.durationInPeriods`),
    expiresAt: z.string(),
    firstTimeOnly: z.boolean(),
    grants: z.array(grantFormSchema),
    maxRedemptions: optionalCount(`${ERRORS}.maxRedemptions`),
    minimumAmount: z.string(),
    minimumCurrency: z.string(),
    name: z
      .string()
      .trim()
      .min(1, `${ERRORS}.name`)
      .max(NAME_MAX_LENGTH, `${ERRORS}.nameTooLong`),
    percentage: z.string(),
    priceAppliesTo: z.enum([
      'LICENSE_BASE',
      'ADDONS',
      'BOTH',
      'SELECTED_PRICES',
    ]),
    priceDiscountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
    restrictedCustomerSlug: z.string(),
    startsAt: z.string(),
  });

export type VoucherFormValues = z.infer<typeof voucherFormSchema>;

const asNumber = (text: string): number =>
  /^\d+([.,]\d+)?$/.test(text.trim())
    ? Number(text.trim().replace(',', '.'))
    : Number.NaN;

/** A percentage in (0, 100] as typed (`12,5` is read as `12.5`), or null when it is not one. */
export function readPercentage(text: string): string | null {
  const value = asNumber(text);

  return value > 0 && value <= 100 ? text.trim().replace(',', '.') : null;
}

/**
 * A fixed amount typed in major units, as the integer in minor units the API takes, or
 * null when it is not one: not an amount, nothing, or finer than a minor unit.
 */
export function readFixedAmount(text: string, currency: string): string | null {
  const minor = majorToMinorDecimal(text, currency);

  return minor !== null && /^\d+$/.test(minor) && Number(minor) > 0
    ? minor
    : null;
}

/** The value of a modifier: at least zero to set, above zero to add or multiply. */
export function isModifierValue(
  modifierType: GrantFormValues['modifierType'],
  text: string,
): boolean {
  if (modifierType === 'UNLIMITED') {
    return true;
  }
  const value = asNumber(text);

  return modifierType === 'SET' ? value >= 0 : value > 0;
}

/** What a new voucher starts as: a discount on the base price, for one invoice, open to every customer, with no limit. */
export const initialVoucherFormValues: VoucherFormValues = {
  amount: '',
  annualOnly: false,
  applicableAddonIds: [],
  applicableAddonPriceIds: [],
  applicableLicenseIds: [],
  applicableLicensePriceIds: [],
  code: '',
  currency: '',
  description: '',
  duration: 'ONE_TIME',
  durationInPeriods: Number.NaN,
  expiresAt: '',
  firstTimeOnly: false,
  grants: [],
  maxRedemptions: Number.NaN,
  minimumAmount: '',
  minimumCurrency: '',
  name: '',
  percentage: '',
  priceAppliesTo: 'LICENSE_BASE',
  priceDiscountType: 'PERCENTAGE',
  restrictedCustomerSlug: '',
  startsAt: '',
  voucherType: 'PRICE',
};
