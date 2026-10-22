import { formOptions } from '@tanstack/react-form';
import {
  type LicenseFamilySettingsFormValues,
  licenseFamilySettingsFormSchema,
  NO_FALLBACK,
} from '../../schemas/license-family-settings.schema';

const defaultValues: LicenseFamilySettingsFormValues = {
  fallbackLicenseFamilySlug: NO_FALLBACK,
  trialEndWithoutPaymentMethod: 'CANCEL',
  trialReminderDays: 3,
};

// Shared by the form and the fields that render it, so that the fields are typed
// on the values of the form they belong to.
export const familySettingsFormOpts = formOptions({
  defaultValues,
  validators: { onChange: licenseFamilySettingsFormSchema },
});
