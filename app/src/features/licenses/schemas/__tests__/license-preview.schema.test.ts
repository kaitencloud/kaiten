import { describe, expect, it } from 'vite-plus/test';
import {
  initialLicensePreviewValues,
  isValidQuantity,
  type LicensePreviewFormValues,
  licensePreviewFormSchema,
  previewValuesToScenario,
} from '../license-preview.schema';

const values = (
  overrides: Partial<LicensePreviewFormValues> = {},
): LicensePreviewFormValues => ({
  ...initialLicensePreviewValues('monthly', ['traces', 'requests']),
  ...overrides,
});

const issuesOf = (form: LicensePreviewFormValues) => {
  const result = licensePreviewFormSchema.safeParse(form);

  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join('.'), issue.message]);
};

describe('a quantity of sample usage', () => {
  it('is a non-negative decimal with a point', () => {
    for (const text of ['0', '172345', '0.72345', ' 5 ']) {
      expect(isValidQuantity(text)).toBe(true);
    }
  });

  it('is not guessed from a comma, a sign, an exponent or a unit', () => {
    for (const text of ['172,345', '1,5', '-1', '+1', '1e5', '.5', '5.', '5 k', 'abc', '']) {
      expect(isValidQuantity(text)).toBe(false);
    }
  });
});

describe('the form of an invoice preview', () => {
  it('starts on a base, with an empty sample for each entitlement', () => {
    expect(initialLicensePreviewValues('monthly', ['traces'])).toEqual({
      basePriceId: 'monthly',
      samples: { traces: '' },
    });
  });

  it('accepts no usage at all, and usage typed', () => {
    expect(issuesOf(values())).toEqual([]);
    expect(
      issuesOf(values({ samples: { requests: '', traces: '172345' } })),
    ).toEqual([]);
  });

  it('refuses a quantity that is not one, on the entitlement it was typed for', () => {
    expect(
      issuesOf(values({ samples: { requests: '', traces: '172,345' } })),
    ).toEqual([
      ['samples.traces', 'Pages.Licenses.Prices.Preview.Errors.quantity'],
    ]);
  });
});

describe('the scenario the API takes', () => {
  it('names no base when it is the one the API picks, and leaves out what has no usage', () => {
    expect(
      previewValuesToScenario(
        values({ samples: { requests: '', traces: '172345' } }),
        'monthly',
      ),
    ).toEqual({
      basePriceId: undefined,
      sampleUsage: [{ entitlementSlug: 'traces', quantity: '172345' }],
    });
  });

  it('names the base when it is not the default, or when there is no default', () => {
    expect(
      previewValuesToScenario(values({ basePriceId: 'annual' }), 'monthly')
        .basePriceId,
    ).toBe('annual');
    expect(
      previewValuesToScenario(values({ basePriceId: 'annual' }), undefined)
        .basePriceId,
    ).toBe('annual');
  });

  it('sends nothing of usage when none was typed', () => {
    expect(JSON.stringify(previewValuesToScenario(values(), 'monthly'))).toBe(
      '{}',
    );
  });

  it('sends a quantity as the string it was typed, trimmed, never as a number', () => {
    const { sampleUsage } = previewValuesToScenario(
      values({ samples: { requests: ' 0.5 ', traces: '' } }),
      'monthly',
    );

    expect(sampleUsage).toEqual([{ entitlementSlug: 'requests', quantity: '0.5' }]);
  });
});
