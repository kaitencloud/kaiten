import { z } from 'zod';
import type { LicenseFamilyUpdate, LicenseFamilyView } from '@/api-client';
import { zLicenseFamilyView } from '@/api-client/zod.gen';

/**
 * The select of the fallback cannot hold an empty value, so "no fallback" travels
 * through the form as this sentinel and is sent as the empty string, which is how
 * the API takes a fallback away. A family slug is lowercase, so it never equals it.
 */
export const NO_FALLBACK = 'NONE';

// What the API takes of the lead of the trial reminder, in days.
export const MIN_TRIAL_REMINDER_DAYS = 1;
export const MAX_TRIAL_REMINDER_DAYS = 30;

export const TRIAL_REMINDER_DAYS_ERROR_KEY =
  'Pages.Licenses.FamilySettings.Errors.trialReminderDays';

/**
 * The settings of a family the form edits besides its public listing, which has a
 * switch of its own on the row. It starts from what the API declares of a family
 * (the two ways a trial can end) and says the rest in its own words: a fallback
 * is a slug or none, and the lead of the reminder is a whole number of days from 1
 * to 30 (the contract states the bounds on the family it reads and not on the
 * update; a unit test holds these within it).
 */
export const licenseFamilySettingsFormSchema = zLicenseFamilyView
  .pick({ trialEndWithoutPaymentMethod: true })
  .extend({
    fallbackLicenseFamilySlug: z.string().max(255),
    // An empty field reads as NaN, which the number check would refuse in its
    // own words: the form says it in its own.
    trialReminderDays: z
      .number({ error: TRIAL_REMINDER_DAYS_ERROR_KEY })
      .int(TRIAL_REMINDER_DAYS_ERROR_KEY)
      .min(MIN_TRIAL_REMINDER_DAYS, TRIAL_REMINDER_DAYS_ERROR_KEY)
      .max(MAX_TRIAL_REMINDER_DAYS, TRIAL_REMINDER_DAYS_ERROR_KEY),
  });

export type LicenseFamilySettingsFormValues = z.infer<
  typeof licenseFamilySettingsFormSchema
>;

type SettingsFamily = Pick<
  LicenseFamilyView,
  | 'fallbackLicenseFamilySlug'
  | 'trialEndWithoutPaymentMethod'
  | 'trialReminderDays'
>;

/** The form as it opens: the settings the family has now. */
export const familyToSettingsFormValues = (
  family: SettingsFamily,
): LicenseFamilySettingsFormValues => ({
  fallbackLicenseFamilySlug: family.fallbackLicenseFamilySlug ?? NO_FALLBACK,
  trialEndWithoutPaymentMethod: family.trialEndWithoutPaymentMethod,
  trialReminderDays: family.trialReminderDays,
});

/**
 * The partial update the form sends: the settings that differ from the ones it
 * opened with, and nothing else, so that a setting saved from another tab since is
 * not taken back and the API, which keeps what an update leaves out, changes only
 * what was changed. A fallback taken away is the empty string. An update with
 * nothing to change is an empty object, which the caller does not send.
 */
export function settingsFormValuesToUpdateBody(
  values: LicenseFamilySettingsFormValues,
  opened: LicenseFamilySettingsFormValues,
): LicenseFamilyUpdate {
  const body: LicenseFamilyUpdate = {};

  if (values.fallbackLicenseFamilySlug !== opened.fallbackLicenseFamilySlug) {
    body.fallbackLicenseFamilySlug =
      values.fallbackLicenseFamilySlug === NO_FALLBACK
        ? ''
        : values.fallbackLicenseFamilySlug;
  }
  if (
    values.trialEndWithoutPaymentMethod !== opened.trialEndWithoutPaymentMethod
  ) {
    body.trialEndWithoutPaymentMethod = values.trialEndWithoutPaymentMethod;
  }
  if (values.trialReminderDays !== opened.trialReminderDays) {
    body.trialReminderDays = values.trialReminderDays;
  }

  return body;
}

/**
 * Where a refusal of the API is shown on the form: it names the field in prose
 * and does not locate it, so the code says which it is.
 */
export const LICENSE_FAMILY_REFUSAL_FIELDS = {
  'UpdateLicenseFamily.InvalidFallback': 'fallbackLicenseFamilySlug',
  'UpdateLicenseFamily.InvalidTrialEndBehavior': 'trialEndWithoutPaymentMethod',
  'UpdateLicenseFamily.InvalidTrialReminderDays': 'trialReminderDays',
} as const satisfies Record<string, keyof LicenseFamilySettingsFormValues>;
