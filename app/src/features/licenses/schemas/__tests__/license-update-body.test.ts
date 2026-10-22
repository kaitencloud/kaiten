import { describe, expect, it } from 'vite-plus/test';
import type { License } from '@/api-client';
import {
  commercialFormValuesToUpdateBody,
  licenseToCommercialFormValues,
} from '../license-commercial.schema';
import { licenseToUpdateBody } from '../license-update-body';

const license = {
  description: 'Standard',
  isDefault: true,
  name: 'Standard',
  pricingType: 'PAID',
  requiresPaymentMethod: true,
  selfServeCtaUrl: 'https://acme.test/contact',
  trialPeriodDays: 14,
  type: 'PAID',
  versionName: 'Version - 1',
} satisfies Parameters<typeof licenseToUpdateBody>[0];

describe('licenseToUpdateBody', () => {
  it('restates the version as it stands, with what an update never changes left out', () => {
    expect(licenseToUpdateBody(license)).toEqual(license);
  });

  it('leaves out the trial and the URL a version has not, and reads the defaults the API leaves out', () => {
    const body = licenseToUpdateBody({
      description: 'Standard',
      isDefault: false,
      name: 'Standard',
      selfServeCtaUrl: '',
      trialPeriodDays: 0,
      type: 'PAID',
      versionName: 'Version - 1',
    });

    expect(body).toEqual({
      description: 'Standard',
      isDefault: false,
      name: 'Standard',
      pricingType: 'CUSTOM',
      requiresPaymentMethod: false,
      type: 'PAID',
      versionName: 'Version - 1',
    });
  });

  // The two bodies of a form are compared with each other, and the restated one
  // is what the API holds merged under them: a form that changed nothing must
  // restate the version exactly, or it would "change" a field it never touched.
  it.each([
    ['a version with terms', license],
    [
      'a version with none',
      {
        ...license,
        selfServeCtaUrl: undefined,
        trialPeriodDays: undefined,
      } satisfies Parameters<typeof licenseToUpdateBody>[0],
    ],
  ])('equals what the commercial form sends when nothing was changed on %s', (_, version) => {
    const values = licenseToCommercialFormValues(version as License);

    expect(
      commercialFormValuesToUpdateBody(values, version as License),
    ).toEqual(licenseToUpdateBody(version));
  });
});
