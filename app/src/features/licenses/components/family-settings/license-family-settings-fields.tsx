import { useTranslation } from 'react-i18next';
import { withForm } from '@/hooks/form';
import {
  MAX_TRIAL_REMINDER_DAYS,
  MIN_TRIAL_REMINDER_DAYS,
  NO_FALLBACK,
} from '../../schemas/license-family-settings.schema';
import type { FallbackOption } from '../../utils/license-family-settings.utils';
import { LicenseFamilyFallbackWarning } from './license-family-fallback-warning';
import { familySettingsFormOpts } from './license-family-settings-form-options';

const TRIAL_END_BEHAVIORS = ['CANCEL', 'CONVERT'] as const;
type TrialEndBehavior = (typeof TRIAL_END_BEHAVIORS)[number];

// Typed against the contract (`satisfies Record<Enum, string>`), since no check
// reads a key built from a value at run time.
const TRIAL_END_LABEL_KEYS = {
  CANCEL: 'Pages.Licenses.FamilySettings.TrialEnd.CANCEL',
  CONVERT: 'Pages.Licenses.FamilySettings.TrialEnd.CONVERT',
} as const satisfies Record<TrialEndBehavior, string>;

/**
 * The settings of a family that act on its subscriptions: the free license an
 * instance moves to when its subscription ends, what a trial that is charged
 * automatically becomes at its end when the customer has no payment method, and
 * how long before a trial ends it announces it.
 */
export const LicenseFamilySettingsFields = withForm({
  ...familySettingsFormOpts,
  props: {
    fallbackOptions: [] as FallbackOption[],
    /** The family is public and has a paid version: it is sold, so a fallback matters. */
    warnWithoutFallback: false,
  },
  render: function LicenseFamilySettingsFieldsRender({
    fallbackOptions,
    form,
    warnWithoutFallback,
  }) {
    const { t } = useTranslation();

    return (
      <div className="space-y-5">
        <form.AppField name="fallbackLicenseFamilySlug">
          {(field) => (
            <field.SelectField
              description={t(
                'Pages.Licenses.FamilySettings.Descriptions.fallback',
              )}
              getOptionLabel={(option) => (option as FallbackOption).label}
              getOptionValue={(option) => (option as FallbackOption).value}
              label={t('Pages.Licenses.FamilySettings.Labels.fallback')}
              options={fallbackOptions}
            />
          )}
        </form.AppField>
        {warnWithoutFallback ? (
          <form.Subscribe
            selector={(state) =>
              state.values.fallbackLicenseFamilySlug === NO_FALLBACK
            }
          >
            {(hasNone) =>
              hasNone ? <LicenseFamilyFallbackWarning inSettingsDialog /> : null
            }
          </form.Subscribe>
        ) : null}
        <form.AppField name="trialEndWithoutPaymentMethod">
          {(field) => (
            <field.SelectField
              description={t(
                'Pages.Licenses.FamilySettings.Descriptions.trialEnd',
              )}
              getOptionLabel={(option) =>
                t(TRIAL_END_LABEL_KEYS[option as TrialEndBehavior])
              }
              label={t('Pages.Licenses.FamilySettings.Labels.trialEnd')}
              options={[...TRIAL_END_BEHAVIORS]}
              required
            />
          )}
        </form.AppField>
        <form.AppField name="trialReminderDays">
          {(field) => (
            <field.NumberField
              // More than a month is refused in words, and not changed to a month.
              allowOutOfRange
              description={t(
                'Pages.Licenses.FamilySettings.Descriptions.trialReminder',
              )}
              label={t('Pages.Licenses.FamilySettings.Labels.trialReminder')}
              max={MAX_TRIAL_REMINDER_DAYS}
              min={MIN_TRIAL_REMINDER_DAYS}
              required
              step={1}
            />
          )}
        </form.AppField>
      </div>
    );
  },
});
