import { z } from 'zod';
import type { LicenseFamilyUpdate, LicenseFamilyView } from '@/api-client';
import { zLicenseFamilyUpdate, zLicenseFamilyView } from '@/api-client/zod.gen';

/**
 * The select of the fallback cannot hold an empty value, so "no fallback" travels
 * through the form as this sentinel and is sent as the empty string, which is how
 * the API takes a fallback away. A family slug is lowercase, so it never equals it.
 */
export const NO_FALLBACK = 'NONE';

// What the API says of the lead of the trial reminder, in days, on a family it
// reads: the contract states the bounds there and not on the update.
const trialReminderDaysContract = zLicenseFamilyView.shape.trialReminderDays;
export const MIN_TRIAL_REMINDER_DAYS =
  trialReminderDaysContract.minValue ?? undefined;
export const MAX_TRIAL_REMINDER_DAYS =
  trialReminderDaysContract.maxValue ?? undefined;

export const TRIAL_REMINDER_DAYS_ERROR_KEY =
  'Pages.Licenses.FamilySettings.Errors.trialReminderDays';

/**
 * The settings of a family the form edits besides its public listing, which has a
 * switch of its own on the row. It starts from what the API declares: the two
 * ways a trial can end and the bounds of the reminder come from the family it
 * reads (the update types the first as a bare string and bounds neither), the
 * length of a fallback from the update. The reminder is refused in the form's
 * own words, whatever the contract refuses it for.
 */
export const licenseFamilySettingsFormSchema = zLicenseFamilyView
  .pick({ trialEndWithoutPaymentMethod: true })
  .extend({
    fallbackLicenseFamilySlug:
      zLicenseFamilyUpdate.shape.fallbackLicenseFamilySlug.unwrap(),
    // An empty field reads as NaN, which the contract refuses like any other
    // number out of its bounds.
    trialReminderDays: z.custom<number>(
      (days) => trialReminderDaysContract.safeParse(days).success,
      { error: TRIAL_REMINDER_DAYS_ERROR_KEY },
    ),
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
 * Where a refusal of the API is shown on the form, and in what words: it names the
 * field in prose and does not locate it, so the code says which it is, and its
 * English detail is the API's, not the console's, so each code has a sentence of
 * the locales. A code that is not here is shown above the buttons, in the API's words.
 */
export const LICENSE_FAMILY_REFUSALS = {
  'UpdateLicenseFamily.InvalidFallback': {
    field: 'fallbackLicenseFamilySlug',
    messageKey: 'Pages.Licenses.FamilySettings.Refusals.invalidFallback',
  },
  'UpdateLicenseFamily.InvalidTrialEndBehavior': {
    field: 'trialEndWithoutPaymentMethod',
    messageKey: 'Pages.Licenses.FamilySettings.Refusals.invalidTrialEnd',
  },
  'UpdateLicenseFamily.InvalidTrialReminderDays': {
    field: 'trialReminderDays',
    messageKey: TRIAL_REMINDER_DAYS_ERROR_KEY,
  },
} as const satisfies Record<
  string,
  { field: keyof LicenseFamilySettingsFormValues; messageKey: string }
>;
