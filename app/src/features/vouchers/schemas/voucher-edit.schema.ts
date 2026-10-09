import { z } from 'zod';
import type { Voucher, VoucherDraft } from '@/api-client';
import { zVoucherDraft } from '@/api-client/zod.gen';
import {
  dateTimeInputToInstant,
  instantToDateTimeInput,
} from '@/lib/date-time-input';
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH } from './voucher.schema';

const INT32_MAX = 2_147_483_647;
const ERRORS = 'Pages.Vouchers.Edit.Errors';

/**
 * What a voucher that is no longer a draft lets its owner change: its name, its
 * description, the end of its window and the most it can be redeemed. The window is
 * the text of a `datetime-local` control, read as UTC, and an empty number is `NaN`.
 */
export const voucherEditSchema = zVoucherDraft
  .pick({ description: true, name: true })
  .extend({
    description: z
      .string()
      .max(DESCRIPTION_MAX_LENGTH, `${ERRORS}.descriptionTooLong`),
    expiresAt: z
      .string()
      .refine(
        (text) => text === '' || dateTimeInputToInstant(text) !== null,
        `${ERRORS}.date`,
      ),
    maxRedemptions: z.custom<number>(
      (count) =>
        typeof count === 'number' &&
        (Number.isNaN(count) ||
          (Number.isInteger(count) && count >= 1 && count <= INT32_MAX)),
      { error: `${ERRORS}.maxRedemptions` },
    ),
    name: z
      .string()
      .trim()
      .min(1, `${ERRORS}.name`)
      .max(NAME_MAX_LENGTH, `${ERRORS}.nameTooLong`),
  });

export type VoucherEditValues = z.infer<typeof voucherEditSchema>;

export const voucherToEditValues = (voucher: Voucher): VoucherEditValues => ({
  description: voucher.description ?? '',
  expiresAt: instantToDateTimeInput(voucher.expiresAt),
  maxRedemptions: voucher.maxRedemptions ?? Number.NaN,
  name: voucher.name,
});

/**
 * What is wrong with the form, field by field, or nothing. Beyond the schema, the most a
 * voucher can be redeemed is not under the redemptions it has had (`MaxRedemptionsBelowCount`),
 * which the API refuses and the form says before it is asked.
 */
export function getVoucherEditErrors(
  values: VoucherEditValues,
  voucher: Pick<Voucher, 'redemptionsCount'>,
): Partial<Record<keyof VoucherEditValues, string>> | undefined {
  const errors: Partial<Record<keyof VoucherEditValues, string>> = {};
  const result = voucherEditSchema.safeParse(values);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];

      if (typeof field === 'string' && !(field in errors)) {
        errors[field as keyof VoucherEditValues] = issue.message;
      }
    }
  }
  if (
    !errors.maxRedemptions &&
    !Number.isNaN(values.maxRedemptions) &&
    values.maxRedemptions < voucher.redemptionsCount
  ) {
    errors.maxRedemptions = `${ERRORS}.belowCount`;
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
}

/**
 * The replacement of an ACTIVE voucher: the four members the person changed, and every
 * other one restated as the API stores it. The API takes the whole body and compares the
 * members it does not let change with what it holds, answering 409 when one differs, and
 * it writes the rules and the description it is given and drops what is missing, so a
 * body with only the four members would clear the minimum amount of the rules. Its
 * grants are compared and not rewritten, so they go as they are stored too.
 */
export function voucherToEditBody(
  voucher: Voucher,
  values: VoucherEditValues,
): VoucherDraft {
  return {
    applicableAddonIds: voucher.applicableAddonIds,
    applicableAddonPriceIds: voucher.applicableAddonPriceIds,
    applicableLicenseIds: voucher.applicableLicenseIds,
    applicableLicensePriceIds: voucher.applicableLicensePriceIds,
    code: voucher.code,
    currency: voucher.currency,
    description:
      values.description.trim() === '' ? undefined : values.description.trim(),
    duration: voucher.duration,
    durationInPeriods: voucher.durationInPeriods,
    expiresAt: dateTimeInputToInstant(values.expiresAt) ?? undefined,
    grants: voucher.grants,
    maxRedemptions: Number.isNaN(values.maxRedemptions)
      ? undefined
      : values.maxRedemptions,
    name: values.name.trim(),
    priceAppliesTo: voucher.priceAppliesTo,
    priceDiscountType: voucher.priceDiscountType,
    priceDiscountValue: voucher.priceDiscountValue,
    redemptionRules: voucher.redemptionRules,
    restrictedCustomerSlug: voucher.restrictedCustomerSlug,
    startsAt: voucher.startsAt,
    voucherType: voucher.voucherType,
  };
}
