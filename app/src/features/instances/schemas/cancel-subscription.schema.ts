import { z } from 'zod';
import type { SubscriptionCancellation } from '@/api-client';
import { zSubscriptionCancellation } from '@/api-client/zod.gen';
import { dateTimeInputToInstant } from '@/lib/date-time-input';

/** The longest reason the API keeps with a cancellation, in characters. */
export const CANCEL_REASON_MAX_LENGTH = 500;

const REASON_ERROR_KEY =
  'Pages.Customers.Instances.Detail.Billing.Cancel.Errors.reason';
const END_DATE_ERROR_KEY =
  'Pages.Customers.Instances.Detail.Billing.Cancel.Errors.endDate';

/** The characters of a reason as the API counts them: code points, not UTF-16 units. */
export const countReasonCharacters = (reason: string) =>
  Array.from(reason.trim()).length;

/**
 * What the cancel dialog edits: when the subscription ends, why, and the two
 * things a cancellation does not do by itself and offers to do beside it. The
 * API takes the first two (`zSubscriptionCancellation`), and nothing of the
 * others: removing the add-ons and setting the end of the license are requests
 * of their own, which the dialog sends once the cancellation is accepted.
 */
export const cancelFormSchema = zSubscriptionCancellation
  .required({ mode: true })
  .extend({
    endDate: z.string(),
    reason: z
      .string()
      .refine(
        (reason) => countReasonCharacters(reason) <= CANCEL_REASON_MAX_LENGTH,
        REASON_ERROR_KEY,
      ),
    removeAddons: z.boolean(),
    setEndDate: z.boolean(),
  })
  .refine(
    (values) =>
      !values.setEndDate || dateTimeInputToInstant(values.endDate) !== null,
    { error: END_DATE_ERROR_KEY, path: ['endDate'] },
  );

export type CancelFormValues = z.infer<typeof cancelFormSchema>;

/**
 * The body of the cancellation. A trial ends at once whatever the mode, and says
 * so: the event the API records then names the mode it was asked for. A reason
 * left empty is not sent.
 */
export function cancelValuesToBody(
  values: CancelFormValues,
  status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'TRIAL',
): SubscriptionCancellation {
  const reason = values.reason.trim();

  return {
    mode: status === 'TRIAL' ? 'IMMEDIATE' : values.mode,
    reason: reason === '' ? undefined : reason,
  };
}

/** Where a refusal of the API is shown on the form: the reason it is about. */
export const CANCEL_REFUSAL_FIELDS = {
  byCode: { 'CancelSubscription.InvalidReason': 'reason' },
} as const;
