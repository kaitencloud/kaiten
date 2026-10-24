import { describe, expect, it } from 'vite-plus/test';
import {
  familyToSettingsFormValues,
  LICENSE_FAMILY_REFUSALS,
  type LicenseFamilySettingsFormValues,
  licenseFamilySettingsFormSchema,
  MAX_TRIAL_REMINDER_DAYS,
  MIN_TRIAL_REMINDER_DAYS,
  NO_FALLBACK,
  settingsFormValuesToUpdateBody,
  TRIAL_REMINDER_DAYS_ERROR_KEY,
} from '../license-family-settings.schema';

const stored = {
  fallbackLicenseFamilySlug: null,
  trialEndWithoutPaymentMethod: 'CANCEL' as const,
  trialReminderDays: 3,
};

const values = (
  overrides: Partial<LicenseFamilySettingsFormValues> = {},
): LicenseFamilySettingsFormValues => ({
  ...familyToSettingsFormValues(stored),
  ...overrides,
});

const issuesOf = (form: LicenseFamilySettingsFormValues) => {
  const result = licenseFamilySettingsFormSchema.safeParse(form);

  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join('.'), issue.message]);
};

describe('the form of the settings of a family', () => {
  it('reads the bounds of the reminder from what the contract declares of a family it reads', () => {
    expect(MIN_TRIAL_REMINDER_DAYS).toBe(1);
    expect(MAX_TRIAL_REMINDER_DAYS).toBe(30);
  });

  it('refuses a fallback longer than the contract takes', () => {
    expect(
      issuesOf(values({ fallbackLicenseFamilySlug: 'a'.repeat(256) })).map(
        ([path]) => path,
      ),
    ).toEqual(['fallbackLicenseFamilySlug']);
    expect(
      issuesOf(values({ fallbackLicenseFamilySlug: 'a'.repeat(255) })),
    ).toEqual([]);
  });

  it('shows a family without a fallback as having none', () => {
    expect(values().fallbackLicenseFamilySlug).toBe(NO_FALLBACK);
    expect(
      familyToSettingsFormValues({
        ...stored,
        fallbackLicenseFamilySlug: 'community',
      }).fallbackLicenseFamilySlug,
    ).toBe('community');
  });

  it('takes every setting the API gives a family', () => {
    expect(issuesOf(values())).toEqual([]);
    expect(
      issuesOf(
        values({
          fallbackLicenseFamilySlug: 'community',
          trialEndWithoutPaymentMethod: 'CONVERT',
          trialReminderDays: 30,
        }),
      ),
    ).toEqual([]);
    expect(issuesOf(values({ trialReminderDays: 1 }))).toEqual([]);
  });

  it.each([0, 31, 2.5, -3, Number.NaN])(
    'refuses a reminder of %s days, in its own words',
    (days) => {
      expect(issuesOf(values({ trialReminderDays: days }))).toEqual([
        ['trialReminderDays', TRIAL_REMINDER_DAYS_ERROR_KEY],
      ]);
    },
  );

  it('refuses a way for a trial to end that the API does not know', () => {
    expect(
      issuesOf(
        values({ trialEndWithoutPaymentMethod: 'KEEP' as 'CANCEL' }),
      ).map(([path]) => path),
    ).toEqual(['trialEndWithoutPaymentMethod']);
  });
});

describe('the partial update of the settings of a family', () => {
  const opened = values();

  it('is empty when nothing was changed', () => {
    expect(settingsFormValuesToUpdateBody(opened, opened)).toEqual({});
  });

  it('carries only the settings that were changed', () => {
    expect(
      settingsFormValuesToUpdateBody(values({ trialReminderDays: 10 }), opened),
    ).toEqual({ trialReminderDays: 10 });
    expect(
      settingsFormValuesToUpdateBody(
        values({ trialEndWithoutPaymentMethod: 'CONVERT' }),
        opened,
      ),
    ).toEqual({ trialEndWithoutPaymentMethod: 'CONVERT' });
    expect(
      settingsFormValuesToUpdateBody(
        values({ fallbackLicenseFamilySlug: 'community' }),
        opened,
      ),
    ).toEqual({ fallbackLicenseFamilySlug: 'community' });
  });

  it('takes a fallback away with the empty string, which is how the API reads it', () => {
    const withFallback = values({ fallbackLicenseFamilySlug: 'community' });

    expect(
      settingsFormValuesToUpdateBody(
        values({ fallbackLicenseFamilySlug: NO_FALLBACK }),
        withFallback,
      ),
    ).toEqual({ fallbackLicenseFamilySlug: '' });
  });

  it('leaves a setting alone that was changed and put back', () => {
    expect(
      settingsFormValuesToUpdateBody(values({ trialReminderDays: 3 }), opened),
    ).toEqual({});
  });
});

describe('the refusals of the API about a family', () => {
  it('are each shown on the field of the form they name, in a sentence of the locales', () => {
    expect(
      Object.fromEntries(
        Object.entries(LICENSE_FAMILY_REFUSALS).map(([code, refusal]) => [
          code,
          refusal.field,
        ]),
      ),
    ).toEqual({
      'UpdateLicenseFamily.InvalidFallback': 'fallbackLicenseFamilySlug',
      'UpdateLicenseFamily.InvalidTrialEndBehavior':
        'trialEndWithoutPaymentMethod',
      'UpdateLicenseFamily.InvalidTrialReminderDays': 'trialReminderDays',
    });
    for (const { field, messageKey } of Object.values(
      LICENSE_FAMILY_REFUSALS,
    )) {
      expect(Object.keys(values())).toContain(field);
      expect(messageKey).toMatch(/^Pages\.Licenses\.FamilySettings\./);
    }
  });
});
