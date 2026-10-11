import { describe, expect, it } from 'vite-plus/test';
import {
  initialLicensePreviewValues,
  isValidQuantity,
  type LicensePreviewFormValues,
  licensePreviewFormSchema,
  type PreviewAddOnRow,
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
      addOns: [],
      basePriceId: 'monthly',
      instanceSlug: '',
      samples: { traces: '' },
      usageSource: 'samples',
      voucherCode: '',
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
        { defaultBasePriceId: 'monthly' },
      ),
    ).toEqual({
      basePriceId: undefined,
      sampleUsage: [{ entitlementSlug: 'traces', quantity: '172345' }],
    });
  });

  it('names the base when it is not the default, or when there is no default', () => {
    expect(
      previewValuesToScenario(values({ basePriceId: 'annual' }), {
        defaultBasePriceId: 'monthly',
      }).basePriceId,
    ).toBe('annual');
    expect(
      previewValuesToScenario(values({ basePriceId: 'annual' })).basePriceId,
    ).toBe('annual');
  });

  it('sends nothing of usage when none was typed', () => {
    expect(
      JSON.stringify(
        previewValuesToScenario(values(), { defaultBasePriceId: 'monthly' }),
      ),
    ).toBe('{}');
  });

  it('sends a quantity as the string it was typed, trimmed, never as a number', () => {
    const { sampleUsage } = previewValuesToScenario(
      values({ samples: { requests: ' 0.5 ', traces: '' } }),
      { defaultBasePriceId: 'monthly' },
    );

    expect(sampleUsage).toEqual([{ entitlementSlug: 'requests', quantity: '0.5' }]);
  });
});

describe('the instance, the add-ons and the code of a preview', () => {
  const addOn = (overrides: Partial<PreviewAddOnRow> = {}): PreviewAddOnRow => ({
    addonSlug: 'extra-seats-v1',
    key: 'add-on-1',
    quantity: 2,
    ...overrides,
  });

  it('asks for an instance once the usage is the instance’s, and for none otherwise', () => {
    expect(issuesOf(values({ usageSource: 'instance' }))).toEqual([
      ['instanceSlug', 'Pages.Licenses.Prices.Preview.Errors.instance'],
    ]);
    expect(
      issuesOf(values({ instanceSlug: 'acme-prod', usageSource: 'instance' })),
    ).toEqual([]);
    expect(issuesOf(values({ instanceSlug: '' }))).toEqual([]);
  });

  it('refuses an add-on row with no version, or with units that are not a whole number of one or more', () => {
    expect(issuesOf(values({ addOns: [addOn()] }))).toEqual([]);
    expect(issuesOf(values({ addOns: [addOn({ addonSlug: '' })] }))).toEqual([
      ['addOns.0.addonSlug', 'Pages.Licenses.Prices.Preview.Errors.addon'],
    ]);
    for (const quantity of [0, -1, 1.5]) {
      expect(issuesOf(values({ addOns: [addOn({ quantity })] }))).toEqual([
        ['addOns.0.quantity', 'Pages.Licenses.Prices.Preview.Errors.addonQuantity'],
      ]);
    }
    // An empty number field is `NaN`, which is said in the words of the form.
    expect(
      issuesOf(values({ addOns: [addOn({ quantity: Number.NaN })] })),
    ).toEqual([
      ['addOns.0.quantity', 'Pages.Licenses.Prices.Preview.Errors.addonQuantity'],
    ]);
  });

  it('sends the add-ons with their units, and the key of a row nowhere', () => {
    const scenario = previewValuesToScenario(
      values({
        addOns: [
          addOn(),
          addOn({ addonSlug: 'extra-tokens-v1', key: 'add-on-2', quantity: 1 }),
        ],
      }),
    );

    expect(scenario.addOns).toEqual([
      { addonSlug: 'extra-seats-v1', quantity: 2 },
      { addonSlug: 'extra-tokens-v1', quantity: 1 },
    ]);
    expect(JSON.stringify(scenario)).not.toContain('add-on-1');
  });

  it('sends the instance and no sample when the usage is the instance’s, the samples and no instance otherwise', () => {
    const typed = { requests: '', traces: '172345' };

    expect(
      previewValuesToScenario(
        values({
          instanceSlug: 'acme-prod',
          samples: typed,
          usageSource: 'instance',
        }),
        { defaultBasePriceId: 'monthly' },
      ),
    ).toEqual({ instanceSlug: 'acme-prod' });
    expect(
      previewValuesToScenario(
        values({ instanceSlug: 'acme-prod', samples: typed }),
        { defaultBasePriceId: 'monthly' },
      ),
    ).toEqual({
      sampleUsage: [{ entitlementSlug: 'traces', quantity: '172345' }],
    });
  });

  it('leaves out a sample for a meter that is not offered any more', () => {
    expect(
      previewValuesToScenario(
        values({ samples: { requests: '10', tokens: '5', traces: '1' } }),
        { meterSlugs: ['traces', 'requests'] },
      ).sampleUsage,
    ).toEqual([
      { entitlementSlug: 'requests', quantity: '10' },
      { entitlementSlug: 'traces', quantity: '1' },
    ]);
  });

  it('trims the code of a voucher and sends none when it is empty', () => {
    expect(
      previewValuesToScenario(values({ voucherCode: '  WELCOME-2027 ' }))
        .voucherCode,
    ).toBe('WELCOME-2027');
    expect(
      previewValuesToScenario(values({ voucherCode: '   ' })).voucherCode,
    ).toBeUndefined();
  });
});
