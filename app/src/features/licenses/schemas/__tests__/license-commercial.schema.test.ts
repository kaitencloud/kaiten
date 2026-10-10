import { describe, expect, it } from 'vite-plus/test';
import { zLicenseWritable } from '@/api-client/zod.gen';
import {
  commercialFormValuesToUpdateBody,
  type LicenseCommercialFormValues,
  licenseCommercialFormSchema,
  licenseToCommercialFormValues,
  MAX_SELF_SERVE_CTA_URL_LENGTH,
  MAX_TRIAL_PERIOD_DAYS,
} from '../license-commercial.schema';

const sold = {
  description: 'Pro plan',
  isDefault: false,
  name: 'Pro',
  pricingType: 'PAID' as const,
  requiresPaymentMethod: true,
  selfServeCtaUrl: 'https://acme.test/contact',
  trialPeriodDays: 14,
  type: 'PAID' as const,
  versionName: 'Pro 2026',
};

const unsold = {
  ...sold,
  pricingType: 'CUSTOM' as const,
  requiresPaymentMethod: false,
  selfServeCtaUrl: undefined,
  trialPeriodDays: undefined,
};

const values = (
  overrides: Partial<LicenseCommercialFormValues> = {},
): LicenseCommercialFormValues => ({
  ...licenseToCommercialFormValues(unsold),
  ...overrides,
});

const issuesOf = (form: LicenseCommercialFormValues) => {
  const result = licenseCommercialFormSchema.safeParse(form);

  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join('.'), issue.message]);
};

describe('the form of the commercial fields', () => {
  it('holds the bounds the contract declares, and the form says them in its own words', () => {
    const contract = zLicenseWritable.shape;

    // The contract now states the bound of the call-to-action URL in its words
    // only (CreateLicense.InvalidSelfServeCtaUrl), so the form holds it alone.
    expect(MAX_SELF_SERVE_CTA_URL_LENGTH).toBe(2048);
    expect(MAX_TRIAL_PERIOD_DAYS).toBe(
      contract.trialPeriodDays.unwrap().maxValue,
    );
  });

  it('reads a version as it is sold, an empty text standing for none', () => {
    expect(licenseToCommercialFormValues(sold)).toEqual({
      pricingType: 'PAID',
      requiresPaymentMethod: true,
      selfServeCtaUrl: 'https://acme.test/contact',
      trialPeriodDays: '14',
    });
    expect(licenseToCommercialFormValues(unsold)).toEqual({
      pricingType: 'CUSTOM',
      requiresPaymentMethod: false,
      selfServeCtaUrl: '',
      trialPeriodDays: '',
    });
  });

  it('reads a trial of 0, which the API sends for none, as none', () => {
    expect(
      licenseToCommercialFormValues({ ...unsold, trialPeriodDays: 0 })
        .trialPeriodDays,
    ).toBe('');
  });

  it('reads what a response leaves out as what the API creates: custom, no payment method', () => {
    expect(licenseToCommercialFormValues({})).toEqual({
      pricingType: 'CUSTOM',
      requiresPaymentMethod: false,
      selfServeCtaUrl: '',
      trialPeriodDays: '',
    });
  });

  it('accepts a version sold with nothing set, and one sold with everything', () => {
    expect(issuesOf(values())).toEqual([]);
    expect(issuesOf(licenseToCommercialFormValues(sold))).toEqual([]);
  });

  it('asks a trial to be at least a day, as the API does, on the trial', () => {
    expect(issuesOf(values({ trialPeriodDays: '0' }))).toEqual([
      ['trialPeriodDays', 'Pages.Licenses.Commercial.Form.Errors.trialMin'],
    ]);
    expect(issuesOf(values({ trialPeriodDays: '14' }))).toEqual([]);
    expect(issuesOf(values({ trialPeriodDays: '  7 ' }))).toEqual([]);
  });

  it('asks a trial to be a whole number of days', () => {
    for (const trialPeriodDays of ['1.5', '-3', 'abc', '2147483648']) {
      expect(issuesOf(values({ trialPeriodDays }))[0]).toEqual([
        'trialPeriodDays',
        'Pages.Licenses.Commercial.Form.Errors.trialWhole',
      ]);
    }
  });

  it('asks a call-to-action URL to be http or https', () => {
    for (const selfServeCtaUrl of ['ftp://x', 'acme.test', 'https://a b']) {
      expect(issuesOf(values({ selfServeCtaUrl }))).toEqual([
        ['selfServeCtaUrl', 'Pages.Licenses.Commercial.Form.Errors.urlScheme'],
      ]);
    }
    expect(issuesOf(values({ selfServeCtaUrl: 'http://acme.test' }))).toEqual([]);
  });

  it('asks a call-to-action URL to be at most 2048 characters', () => {
    const url = (length: number) => `https://${'a'.repeat(length - 8)}`;

    expect(issuesOf(values({ selfServeCtaUrl: url(2048) }))).toEqual([]);
    expect(issuesOf(values({ selfServeCtaUrl: url(2049) }))).toEqual([
      ['selfServeCtaUrl', 'Pages.Licenses.Commercial.Form.Errors.urlLength'],
    ]);
  });
});

describe('the update the form sends', () => {
  it('restates the version, which the API requires, and carries the commercial fields', () => {
    expect(
      commercialFormValuesToUpdateBody(
        values({
          pricingType: 'PAID',
          requiresPaymentMethod: true,
          selfServeCtaUrl: 'https://acme.test/contact',
          trialPeriodDays: '14',
        }),
        unsold,
      ),
    ).toEqual({
      description: 'Pro plan',
      isDefault: false,
      name: 'Pro',
      pricingType: 'PAID',
      requiresPaymentMethod: true,
      selfServeCtaUrl: 'https://acme.test/contact',
      trialPeriodDays: 14,
      type: 'PAID',
      versionName: 'Pro 2026',
    });
  });

  it('sends the trial as a number and the URL trimmed', () => {
    const body = commercialFormValuesToUpdateBody(
      values({ selfServeCtaUrl: ' https://acme.test ', trialPeriodDays: ' 30 ' }),
      unsold,
    );

    expect(body.trialPeriodDays).toBe(30);
    expect(body.selfServeCtaUrl).toBe('https://acme.test');
  });

  it('clears a trial with 0 and a URL with the empty string, since leaving them out keeps them', () => {
    const body = commercialFormValuesToUpdateBody(
      values({
        pricingType: 'PAID',
        requiresPaymentMethod: true,
        selfServeCtaUrl: '',
        trialPeriodDays: '',
      }),
      sold,
    );

    expect(body.trialPeriodDays).toBe(0);
    expect(body.selfServeCtaUrl).toBe('');
  });

  it('sends nothing for a trial and a URL the version has none of and none was typed', () => {
    const body = commercialFormValuesToUpdateBody(values(), unsold);

    expect(JSON.stringify(body)).not.toContain('trialPeriodDays');
    expect(JSON.stringify(body)).not.toContain('selfServeCtaUrl');
  });

  it('never sends a null, which the API ignores', () => {
    const body = commercialFormValuesToUpdateBody(
      values({ selfServeCtaUrl: '', trialPeriodDays: '' }),
      sold,
    );

    expect(Object.values(body)).not.toContain(null);
  });

  it('treats a stored trial of 0 as none: nothing to clear', () => {
    const body = commercialFormValuesToUpdateBody(values(), {
      ...unsold,
      trialPeriodDays: 0,
    });

    expect(body.trialPeriodDays).toBeUndefined();
  });
});
