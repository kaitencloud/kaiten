import { z } from 'zod';
import { zRedeemableCode } from '@/api-client/zod.gen';

const ERRORS =
  'Pages.Customers.Instances.Detail.Billing.Vouchers.Redeem.Errors';

/**
 * What the dialog that applies a code edits: the code. Spaces around it are not part of
 * it. Whether it names a voucher, whether that voucher is in force and whether this
 * instance may redeem it are the API's to say, and it says which, so nothing of that is
 * judged here. Not the contract's own rule with another message on top: its first
 * failure would be the one the person reads, in the words of the validator.
 */
export const redeemVoucherFormSchema = zRedeemableCode
  .pick({ code: true })
  .extend({
    code: z
      .string()
      .trim()
      .min(1, `${ERRORS}.code`)
      .max(64, `${ERRORS}.codeTooLong`),
  });

export type RedeemVoucherFormValues = z.infer<typeof redeemVoucherFormSchema>;

export const initialRedeemVoucherFormValues: RedeemVoucherFormValues = {
  code: '',
};

/** What is wrong with the code typed, or nothing: the first message of the schema. */
export function getRedeemVoucherFormErrors(
  values: RedeemVoucherFormValues,
): Partial<Record<keyof RedeemVoucherFormValues, string>> | undefined {
  const result = redeemVoucherFormSchema.safeParse(values);

  return result.success
    ? undefined
    : { code: result.error.issues[0]?.message ?? `${ERRORS}.code` };
}
