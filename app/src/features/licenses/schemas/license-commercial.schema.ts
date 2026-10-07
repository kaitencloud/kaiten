import { z } from 'zod';
import type { License, LicenseWritable } from '@/api-client';
import { zLicenseWritable } from '@/api-client/zod.gen';
import {
  getPricingType,
  getTrialPeriodDays,
  isHttpUrl,
} from '../utils/license-commercial.utils';

const WHOLE_NUMBER = /^\d+$/;
// The bounds of the contract, which the form says in its own messages: a unit
// test holds them to what the generated schema declares.
export const MAX_SELF_SERVE_CTA_URL_LENGTH = 2048;
export const MAX_TRIAL_PERIOD_DAYS = 2_147_483_647;

/**
 * The form of the commercial fields of a version. It starts from what the API
 * declares of them (the pricing type, the payment method, the URL), and adds what
 * the form needs: the trial and the URL kept as typed, where empty stands for
 * none. The rules the API states in prose are checked here, each message a
 * translation key placed on its field: a trial is at least 1 day, a URL is
 * http(s) and at most 2048 characters.
 */
export const licenseCommercialFormSchema = zLicenseWritable
  .pick({ pricingType: true, requiresPaymentMethod: true })
  // The form always holds both: what the API leaves optional is a value here.
  .required()
  .extend({
    selfServeCtaUrl: z
      .string()
      .max(
        MAX_SELF_SERVE_CTA_URL_LENGTH,
        'Pages.Licenses.Commercial.Form.Errors.urlLength',
      )
      .refine(
        (url) => url.trim() === '' || isHttpUrl(url.trim()),
        'Pages.Licenses.Commercial.Form.Errors.urlScheme',
      ),
    trialPeriodDays: z
      .string()
      .refine(
        (days) =>
          days.trim() === '' ||
          (WHOLE_NUMBER.test(days.trim()) &&
            Number(days) <= MAX_TRIAL_PERIOD_DAYS),
        'Pages.Licenses.Commercial.Form.Errors.trialWhole',
      )
      .refine(
        (days) =>
          days.trim() === '' ||
          !WHOLE_NUMBER.test(days.trim()) ||
          Number(days) >= 1,
        'Pages.Licenses.Commercial.Form.Errors.trialMin',
      ),
  });

export type LicenseCommercialFormValues = z.infer<
  typeof licenseCommercialFormSchema
>;

type CommercialLicense = Pick<
  License,
  | 'pricingType'
  | 'requiresPaymentMethod'
  | 'selfServeCtaUrl'
  | 'trialPeriodDays'
>;

/** The form of a version as it is sold now. */
export function licenseToCommercialFormValues(
  license: CommercialLicense,
): LicenseCommercialFormValues {
  const trial = getTrialPeriodDays(license);

  return {
    pricingType: getPricingType(license),
    requiresPaymentMethod: license.requiresPaymentMethod ?? false,
    selfServeCtaUrl: license.selfServeCtaUrl ?? '',
    trialPeriodDays: trial === undefined ? '' : String(trial),
  };
}

type RestatedLicense = Pick<
  License,
  'description' | 'isDefault' | 'name' | 'type' | 'versionName'
> &
  CommercialLicense;

/**
 * The update the form sends. An update restates the version, which the API
 * requires, and changes only the commercial fields: what it leaves out of them
 * it keeps. A trial or a URL is therefore cleared by saying so, a trial with `0`
 * and a URL with the empty string, and a version that has none sends nothing
 * when none is typed. A `null` is ignored by the API, so it is never sent.
 */
export function commercialFormValuesToUpdateBody(
  values: LicenseCommercialFormValues,
  license: RestatedLicense,
): LicenseWritable {
  const trial = values.trialPeriodDays.trim();
  const url = values.selfServeCtaUrl.trim();

  return {
    description: license.description,
    isDefault: license.isDefault,
    name: license.name,
    pricingType: values.pricingType,
    requiresPaymentMethod: values.requiresPaymentMethod,
    selfServeCtaUrl:
      url === '' ? (license.selfServeCtaUrl ? '' : undefined) : url,
    trialPeriodDays:
      trial === ''
        ? getTrialPeriodDays(license) === undefined
          ? undefined
          : 0
        : Number(trial),
    type: license.type,
    versionName: license.versionName,
  };
}
