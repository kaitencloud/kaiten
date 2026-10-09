import { z } from 'zod';
import type { Addon, NewSubscription, Price } from '@/api-client';
import { zNewSubscription, zSubscriptionAddon } from '@/api-client/zod.gen';
import {
  type BillingPeriod,
  canStartWithTrial,
  getSubscriptionStartBounds,
  isValidDaysUntilDue,
  isValidTrialDays,
} from '@/domains/billing';
import { dateTimeInputToInstant } from '@/lib/date-time-input';
import { getQuantityProblem } from '../utils/instance-addons.utils';

const DAYS_UNTIL_DUE_ERROR_KEY =
  'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.daysUntilDue';
const TRIAL_DAYS_ERROR_KEY =
  'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.trialDays';
const ADDONS_ERROR_KEY =
  'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.addOns';

/**
 * What the subscribe dialog edits: the price to pin the subscription to, the
 * payment terms of this contract when they are not the organization's, the trial
 * it starts with, when billing starts when it is not now, the add-ons to start
 * with, and a voucher code to redeem with it. An empty number reads as `NaN`, as it
 * does in every number field of the console, an empty time is "now", and an empty
 * code is no voucher.
 */
export const subscribeFormSchema = zNewSubscription
  .pick({ basePriceId: true })
  .extend({
    // The units of each add-on that is included, by the slug of its version: one that
    // is left out is not a key. A key is a version chosen, and holds a whole number
    // of units, at least one.
    addOns: z.record(
      zSubscriptionAddon.shape.addonSlug,
      z.custom<number>(
        (units) =>
          typeof units === 'number' && Number.isInteger(units) && units >= 1,
        { error: ADDONS_ERROR_KEY },
      ),
    ),
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
    // The days of trial; empty is none. The API sets no upper bound, the console does.
    trialDays: z.custom<number>(
      (days) =>
        typeof days === 'number' &&
        (Number.isNaN(days) || isValidTrialDays(days)),
      { error: TRIAL_DAYS_ERROR_KEY },
    ),
    // The text of a datetime-local input, read as UTC.
    startAt: z
      .string()
      .refine(
        (text) => text === '' || dateTimeInputToInstant(text) !== null,
        'Pages.Customers.Instances.Detail.Billing.Subscribe.Errors.startAt',
      ),
    // The code is checked by the API alone: whether it exists, whether it is in force and
    // whether this instance may redeem it are its to say, and it says which, in words.
    voucherCode: z.string(),
  });

export type SubscribeFormValues = z.infer<typeof subscribeFormSchema>;

export const initialSubscribeFormValues: SubscribeFormValues = {
  addOns: {},
  basePriceId: '',
  daysUntilDue: Number.NaN,
  startAt: '',
  trialDays: 0,
  voucherCode: '',
};

export type SubscribeFormErrors = Partial<
  Record<keyof SubscribeFormValues, string>
>;

/**
 * What is wrong with the form, field by field, or nothing. Beyond the schema, a
 * start is bounded by the billing period of the price chosen: from one period ago,
 * for a contract that began before it was entered, to now. The API checks it to the
 * second and says so in its own words; this tells the person before they ask, and
 * is the form's own rule, so that it follows the price. The units of an add-on are
 * bounded by the most its version allows, which only the offer knows.
 */
export function getSubscribeFormErrors(
  values: SubscribeFormValues,
  {
    addons = [],
    now = new Date(),
    period,
    trialOffered = true,
  }: {
    addons?: readonly Pick<Addon, 'maxQuantity' | 'slug'>[];
    now?: Date;
    period?: BillingPeriod;
    trialOffered?: boolean;
  } = {},
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
  // A trial that is not offered (the release has none, or the price bills in
  // arrears) is not asked for, whatever the field still holds.
  if (!trialOffered) {
    delete errors.trialDays;
  }
  if (!errors.addOns) {
    const outOfBounds = Object.entries(values.addOns).some(([slug, units]) => {
      const addon = addons.find((candidate) => candidate.slug === slug);

      return (
        addon !== undefined && getQuantityProblem(units, addon) !== undefined
      );
    });
    if (outOfBounds) {
      errors.addOns = ADDONS_ERROR_KEY;
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
 * these are; the collection method is left out, since this release takes none. The
 * add-ons the person included are sent with it, each with its units: the API attaches
 * them with the subscription or refuses it as a whole, and so does it a voucher code
 * that cannot be redeemed. What is empty is not sent: the terms are the organization's,
 * billing starts now, and there is no voucher.
 *
 * The trial is always said when the release has trials: left out, the API takes
 * the one the license carries, and the person has just read and changed it. A price
 * that bills in arrears starts with none, whatever the license says, so it is said
 * to be none; a release without trials is told nothing about them.
 */
export function subscribeValuesToBody(
  values: SubscribeFormValues,
  {
    basePrice,
    trials = false,
  }: { basePrice?: Pick<Price, 'billingTiming'>; trials?: boolean } = {},
): NewSubscription {
  const addOns = Object.entries(values.addOns).map(([addonSlug, quantity]) => ({
    addonSlug,
    quantity,
  }));
  const voucherCode = values.voucherCode.trim();

  return {
    ...(addOns.length > 0 ? { addOns } : {}),
    basePriceId: values.basePriceId,
    daysUntilDue: Number.isNaN(values.daysUntilDue)
      ? undefined
      : values.daysUntilDue,
    providerKind: 'NOOP',
    startAt: dateTimeInputToInstant(values.startAt) ?? undefined,
    ...(trials ? { trialDays: getTrialDays(values, basePrice) } : {}),
    ...(voucherCode === '' ? {} : { voucherCode }),
  };
}

/** The trial the subscription starts with, in days: what was typed, or none where none is offered. */
export function getTrialDays(
  values: Pick<SubscribeFormValues, 'trialDays'>,
  basePrice?: Pick<Price, 'billingTiming'>,
): number {
  return (basePrice && !canStartWithTrial(basePrice.billingTiming)) ||
    Number.isNaN(values.trialDays)
    ? 0
    : values.trialDays;
}

/**
 * Where a refusal of the API is shown on the form. The API names the field in
 * prose and does not locate it, so the code says which it is, and the message
 * goes on that field, where the person is looking.
 */
export const SUBSCRIBE_REFUSAL_FIELDS = {
  byCode: {
    'SubscribeInstance.InvalidDaysUntilDue': 'daysUntilDue',
    'SubscribeInstance.InvalidTrialDays': 'trialDays',
    'SubscribeInstance.PriceDeprecated': 'basePriceId',
    'SubscribeInstance.PriceNotFlatFee': 'basePriceId',
    'SubscribeInstance.PriceNotFound': 'basePriceId',
    'SubscribeInstance.PriceNotOnInstanceLicense': 'basePriceId',
    'SubscribeInstance.StartAtInFuture': 'startAt',
    'SubscribeInstance.StartAtTooEarly': 'startAt',
  },
  byLocation: {
    // An add-on the subscription could not take refuses the subscribe as a whole.
    // Its `detail` is the same sentence for every reason, so the refusal is placed
    // by the location of the error, which carries the reason in its message.
    addOns: 'addOns',
    basePriceId: 'basePriceId',
    daysUntilDue: 'daysUntilDue',
    startAt: 'startAt',
    trialDays: 'trialDays',
    // A code the subscribe could not redeem refuses the whole subscription, and says why
    // on the code: no such code, not in force, not for this customer, already redeemed.
    voucherCode: 'voucherCode',
  },
} as const;
