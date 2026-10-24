import type { License, LicenseWritable } from '@/api-client';
import {
  getPricingType,
  getTrialPeriodDays,
} from '../utils/license-commercial.utils';

type RestatedLicense = Pick<
  License,
  | 'description'
  | 'isDefault'
  | 'name'
  | 'pricingType'
  | 'requiresPaymentMethod'
  | 'selfServeCtaUrl'
  | 'trialPeriodDays'
  | 'type'
  | 'versionName'
>;

/**
 * The update that restates a version as it stands, which is what an update of a
 * version is made of: the API replaces the version, so everything it accepts to
 * change is sent, and the slug, the family, the version number and the lifecycle
 * state are left out, since they never change through it. What the version has not
 * (a trial, a URL) is left out too. Another body for the same version is compared
 * with this one to tell what a form changed: see `saveLicenseOnFresh`.
 */
export function licenseToUpdateBody(license: RestatedLicense): LicenseWritable {
  return {
    description: license.description,
    isDefault: license.isDefault,
    name: license.name,
    pricingType: getPricingType(license),
    requiresPaymentMethod: license.requiresPaymentMethod ?? false,
    selfServeCtaUrl: license.selfServeCtaUrl || undefined,
    trialPeriodDays: getTrialPeriodDays(license),
    type: license.type,
    versionName: license.versionName,
  };
}
