import { z } from 'zod';
import { zNewAiInferenceRefund } from '@/api-client/zod.gen';
import {
  normalizeRefundAmount,
  readDecimalInput,
  refundAmountIssue,
} from '../engine';

/**
 * The refund form, over the API's own body (`zNewAiInferenceRefund`). The
 * amount is a decimal string, never a float, checked by the pricing engine
 * against what is left on the charge; the reason is optional and a blank one
 * is not sent. Messages are translation keys.
 */
/**
 * The amount as the API takes it: read as every decimal field of the AI
 * screens is (trimmed, a decimal comma as a point), then written canonically,
 * since the API counts the decimals as written: "1,5000000" is sent as "1.5".
 */
export function refundAmountOf(typed: string) {
  const text = readDecimalInput(typed);

  return normalizeRefundAmount(text) ?? text;
}

export function refundFormSchema(refundable: string) {
  return zNewAiInferenceRefund.extend({
    credits: z.string().superRefine((value, context) => {
      const issue = refundAmountIssue(refundAmountOf(value), refundable);
      if (issue) {
        context.addIssue({
          code: 'custom',
          message:
            issue === 'EXCEEDS'
              ? 'AI.Receipt.refund.amountExceeds'
              : 'AI.Receipt.refund.amountInvalid',
        });
      }
    }),
    reason: z.string().max(500, { message: 'AI.Receipt.refund.reasonTooLong' }),
  });
}

export type RefundFormValues = z.infer<ReturnType<typeof refundFormSchema>>;

/** What the form sends: the amount as the API takes it, and the reason when there is one. */
export function refundBodyOf(values: RefundFormValues) {
  const reason = values.reason.trim();

  return {
    credits: refundAmountOf(values.credits),
    reason: reason || undefined,
  };
}
