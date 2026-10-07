import { z } from 'zod';
import type { NewSubscription } from '@/api-client';
import { zNewSubscription } from '@/api-client/zod.gen';
import {
  type BillingPeriod,
  getSubscriptionStartBounds,
  isValidDaysUntilDue,
} from '@/domains/billing';
import { dateTimeInputToInstant } from '@/lib/date-time-input';

const DAYS_UNTIL_DUE_ERROR_KEY =
  'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.daysUntilDue';

/**
 * What the subscribe dialog edits: the price to pin the subscription to, the
 * payment terms of this contract when they are not the organization's, and when
 * billing starts when it is not now. An empty number reads as `NaN`, as it does
 * in every number field of the console, and an empty time is "now".
 */
export const subscribeFormSchema = zNewSubscription
  .pick({ basePriceId: true })
  .extend({
    basePriceId: zNewSubscription.shape.basePriceId.min(
      1,
      'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.basePrice',
    ),
    // Empty is `NaN`, which the number type of the schema would refuse in its own
    // words: it is the answer "the organization's terms", so it is accepted here.
    daysUntilDue: z.custom<number>(
      (days) =>
        typeof days === 'number' &&
        (Number.isNaN(days) || isValidDaysUntilDue(days)),
      { error: DAYS_UNTIL_DUE_ERROR_KEY },
    ),
    // The text of a datetime-local input, read as UTC.
    startAt: z
      .string()
      .refine(
        (text) => text === '' || dateTimeInputToInstant(text) !== null,
        'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.startAt',
      ),
  });

export type SubscribeFormValues = z.infer<typeof subscribeFormSchema>;

export const initialSubscribeFormValues: SubscribeFormValues = {
  basePriceId: '',
  daysUntilDue: Number.NaN,
  startAt: '',
};

export type SubscribeFormErrors = Partial<
  Record<keyof SubscribeFormValues, string>
>;

/**
 * What is wrong with the form, field by field, or nothing. Beyond the schema, a
 * start is bounded by the billing period of the price chosen: from one period ago,
 * for a contract that began before it was entered, to now. The API checks it to the
 * second and says so in its own words; this tells the person before they ask, and
 * is the form's own rule, so that it follows the price.
 */
export function getSubscribeFormErrors(
  values: SubscribeFormValues,
  { now = new Date(), period }: { now?: Date; period?: BillingPeriod } = {},
): SubscribeFormErrors | undefined {
  const errors: SubscribeFormErrors = {};
  const result = subscribeFormSchema.safeParse(values);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !(field in errors)) {
        errors[field as keyof SubscribeFormValues] = issue.message;
      }
    }
  }

  const start = dateTimeInputToInstant(values.startAt);
  if (!errors.startAt && start !== null && period) {
    const { earliest, latest } = getSubscriptionStartBounds(period, now);
    const at = Date.parse(start);
    if (at > latest.getTime()) {
      errors.startAt =
        'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.startAtFuture';
    } else if (at < earliest.getTime()) {
      errors.startAt =
        'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.startAtTooEarly';
    }
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
}

/**
 * The body of the subscription. NoOp is the only provider of a release that ships
 * no payment provider, and it is named so that the request says whose invoices
 * these are; the collection method, a trial, add-ons and a voucher are left out,
 * since this release takes none. What is empty is not sent: the terms are the
 * organization's, and billing starts now.
 */
export function subscribeValuesToBody(
  values: SubscribeFormValues,
): NewSubscription {
  return {
    basePriceId: values.basePriceId,
    daysUntilDue: Number.isNaN(values.daysUntilDue)
      ? undefined
      : values.daysUntilDue,
    providerKind: 'NOOP',
    startAt: dateTimeInputToInstant(values.startAt) ?? undefined,
  };
}

/**
 * Where a refusal of the API is shown on the form. The API names the field in
 * prose and does not locate it, so the code says which it is, and the message
 * goes on that field, where the person is looking.
 */
export const SUBSCRIBE_REFUSAL_FIELDS = {
  byCode: {
    'SubscribeInstance.InvalidDaysUntilDue': 'daysUntilDue',
    'SubscribeInstance.PriceDeprecated': 'basePriceId',
    'SubscribeInstance.PriceNotFlatFee': 'basePriceId',
    'SubscribeInstance.PriceNotFound': 'basePriceId',
    'SubscribeInstance.PriceNotOnInstanceLicense': 'basePriceId',
    'SubscribeInstance.StartAtInFuture': 'startAt',
    'SubscribeInstance.StartAtTooEarly': 'startAt',
  },
  byLocation: {
    basePriceId: 'basePriceId',
    daysUntilDue: 'daysUntilDue',
    startAt: 'startAt',
  },
} as const;
