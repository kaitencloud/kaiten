import { describe, expect, it } from 'vite-plus/test';
import type { Entitlement } from '@/api-client';
import {
  entitlementFormSchema,
  getEntitlementFormDefaults,
  initialEntitlementFormValues,
  isCombinedFormValues,
  newSourceRow,
} from '../entitlement-form.shared';
import {
  entitlementToUpdateBody,
  sourcesToBody,
} from '../../../utils/entitlement-writable';

// A combined entitlement (usageSource COMBINED_USAGE) is the weighted sum of the usage of
// other entitlements, its sources: the form asks for at least two, each named once, each with
// a weight that is a positive exact decimal, and sends nothing of a window of its own.

const combined: Entitlement = {
  aggregationMethod: 'SUM',
  createdAt: '2026-03-01T09:00:00.000Z',
  description: 'The credits a customer reads',
  id: 'entitlement-credits',
  name: 'Credits',
  resetAnchor: 'CALENDAR',
  resetPeriod: 'MONTH',
  slug: 'credits',
  sources: [
    { entitlementSlug: 'ai-credits', weight: '0.6' },
    { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
  ],
  type: 'NUMBER',
  unitPlural: 'credits',
  unitSingular: 'credit',
  updatedAt: '2026-03-01T09:00:00.000Z',
  usageSource: 'COMBINED_USAGE',
  userFacing: true,
  warningThresholdPercent: 0,
};

const calculated: Entitlement = {
  ...combined,
  resetAnchor: undefined,
  resetPeriod: undefined,
  sources: undefined,
  usageSource: 'CALCULATED_USAGE',
};

const validCombined = () => ({
  ...initialEntitlementFormValues,
  name: 'Credits',
  sources: [
    { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
    { entitlementSlug: 'ai-credits', weight: '0.6' },
  ],
  usageSource: 'COMBINED_USAGE' as const,
});

const issuesOf = (values: unknown) => {
  const result = entitlementFormSchema.safeParse(values);

  return result.success
    ? []
    : result.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join('.'),
      }));
};

describe('the schema of the form, for a combined entitlement', () => {
  it('accepts two sources with their weights, which do not have to add up to 1', () => {
    expect(issuesOf(validCombined())).toEqual([]);
    expect(
      issuesOf({
        ...validCombined(),
        sources: [
          { entitlementSlug: 'a-one', weight: '2.5' },
          { entitlementSlug: 'b-two', weight: '10' },
        ],
      }),
    ).toEqual([]);
  });

  it('asks for at least two sources', () => {
    expect(issuesOf({ ...validCombined(), sources: [] })).toEqual([
      {
        message: 'Pages.Entitlements.Mutation.Form.Errors.sourcesMin',
        path: 'sources',
      },
    ]);
    expect(
      issuesOf({
        ...validCombined(),
        sources: [{ entitlementSlug: 'ai-credits', weight: '1' }],
      }),
    ).toContainEqual({
      message: 'Pages.Entitlements.Mutation.Form.Errors.sourcesMin',
      path: 'sources',
    });
  });

  it('asks for an entitlement on each line, and names each once, on the line that repeats', () => {
    expect(
      issuesOf({
        ...validCombined(),
        sources: [newSourceRow(), { entitlementSlug: 'ai-credits', weight: '1' }],
      }),
    ).toEqual([
      {
        message: 'Pages.Entitlements.Mutation.Form.Errors.sourceRequired',
        path: 'sources.0.entitlementSlug',
      },
    ]);
    expect(
      issuesOf({
        ...validCombined(),
        sources: [
          { entitlementSlug: 'ai-credits', weight: '1' },
          { entitlementSlug: 'ai-credits', weight: '2' },
        ],
      }),
    ).toEqual([
      {
        message: 'Pages.Entitlements.Mutation.Form.Errors.sourceDuplicate',
        path: 'sources.1.entitlementSlug',
      },
    ]);
  });

  it.each([
    '',
    '0',
    '0.0',
    '0.0000000000',
    '-1',
    '1e3',
    'abc',
    '1,5',
    '123456789',
    '1.12345678901',
  ])('refuses a weight of "%s", on the line that holds it', (weight) => {
    expect(
      issuesOf({
        ...validCombined(),
        sources: [
          { entitlementSlug: 'firecrawl-credits', weight: '1' },
          { entitlementSlug: 'ai-credits', weight },
        ],
      }),
    ).toEqual([
      {
        message: 'Pages.Entitlements.Mutation.Form.Errors.sourceWeight',
        path: 'sources.1.weight',
      },
    ]);
  });

  it.each(['1', '0.4', '0.0000000001', '12345678', '12345678.1234567891', ' 2 '])(
    'accepts a weight of "%s"',
    (weight) => {
      expect(
        issuesOf({
          ...validCombined(),
          sources: [
            { entitlementSlug: 'firecrawl-credits', weight },
            { entitlementSlug: 'ai-credits', weight: '1' },
          ],
        }),
      ).toEqual([]);
    },
  );

  // The form shows no reset period for a combined entitlement, and its body sends none: a pair
  // set before choosing to combine must not refuse a form that has no field to show why.
  it('does not read the reset fields it hides', () => {
    const hidden = { resetAnchor: 'BILLING_PERIOD', resetPeriod: 'WEEK' } as const;

    expect(issuesOf({ ...validCombined(), ...hidden })).toEqual([]);
    // Shown, on a calculated number, the same pair is still refused, on its anchor.
    expect(
      issuesOf({
        ...validCombined(),
        ...hidden,
        sources: [],
        usageSource: 'CALCULATED_USAGE',
      }),
    ).toEqual([
      {
        message: 'Pages.Entitlements.Mutation.Form.Errors.resetAnchorCadence',
        path: 'resetAnchor',
      },
    ]);
  });

  // A line left blank on an entitlement that is not combined is a line nobody sees.
  it.each([
    ['a calculated number', { usageSource: 'CALCULATED_USAGE' }],
    ['a credit pool', { type: 'NUMBER_AI_CREDIT', usageSource: 'COMBINED_USAGE' }],
    ['a flag', { type: 'BOOLEAN', usageSource: 'COMBINED_USAGE' }],
  ] as const)('asks nothing of the sources of %s', (_name, overrides) => {
    expect(
      issuesOf({
        ...validCombined(),
        ...overrides,
        sources: [newSourceRow()],
      }),
    ).toEqual([]);
  });
});

describe('isCombinedFormValues', () => {
  it('holds for a NUMBER that is combined, and for nothing else', () => {
    expect(
      isCombinedFormValues({ type: 'NUMBER', usageSource: 'COMBINED_USAGE' }),
    ).toBe(true);
    expect(
      isCombinedFormValues({ type: 'NUMBER', usageSource: 'CALCULATED_USAGE' }),
    ).toBe(false);
    expect(
      isCombinedFormValues({
        type: 'NUMBER_AI_CREDIT',
        usageSource: 'COMBINED_USAGE',
      }),
    ).toBe(false);
  });
});

describe('the defaults of the form', () => {
  it('start a new entitlement as calculated, with no source', () => {
    expect(initialEntitlementFormValues.usageSource).toBe('CALCULATED_USAGE');
    expect(initialEntitlementFormValues.sources).toEqual([]);
    expect(getEntitlementFormDefaults()).toBe(initialEntitlementFormValues);
  });

  it('give a line of sources a weight of 1', () => {
    expect(newSourceRow()).toEqual({ entitlementSlug: '', weight: '1' });
  });

  it('seed the sources of a combined entitlement as the API writes them back', () => {
    const defaults = getEntitlementFormDefaults({
      ...combined,
      sources: [
        { entitlementSlug: 'ai-credits', weight: '0.60' },
        { entitlementSlug: 'firecrawl-credits' },
      ],
    });

    expect(defaults.usageSource).toBe('COMBINED_USAGE');
    expect(defaults.sources).toEqual([
      { entitlementSlug: 'ai-credits', weight: '0.6' },
      { entitlementSlug: 'firecrawl-credits', weight: '1' },
    ]);
  });

  it('read an entitlement that says nothing of its usage as calculated', () => {
    const defaults = getEntitlementFormDefaults({
      ...calculated,
      usageSource: undefined,
    });

    expect(defaults.usageSource).toBe('CALCULATED_USAGE');
    expect(defaults.sources).toEqual([]);
  });
});

describe('sourcesToBody', () => {
  it('writes the weights as the API writes them back, and a weight left out as 1', () => {
    expect(
      sourcesToBody([
        { entitlementSlug: 'a-one', weight: '0.40' },
        { entitlementSlug: 'b-two', weight: '1.0' },
        { entitlementSlug: 'c-three' },
      ]),
    ).toEqual([
      { entitlementSlug: 'a-one', weight: '0.4' },
      { entitlementSlug: 'b-two', weight: '1' },
      { entitlementSlug: 'c-three', weight: '1' },
    ]);
  });
});

describe('entitlementToUpdateBody, for a combined entitlement', () => {
  // The PUT replaces the sources as a whole and refuses one that names none
  // (422 UpdateEntitlement.CombinedSourcesRequired): a rename that left them out would fail.
  it('names the sources again, and where the usage comes from, in a rename', () => {
    const body = entitlementToUpdateBody(combined, { name: 'Credits (renamed)' });

    expect(body.name).toBe('Credits (renamed)');
    expect(body.usageSource).toBe('COMBINED_USAGE');
    expect(body.sources).toEqual([
      { entitlementSlug: 'ai-credits', weight: '0.6' },
      { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
    ]);
    expect(body.aggregationMethod).toBe('SUM');
  });

  // The window is derived from the sources, which the edit may have moved: a value sent has to
  // be theirs, so none is sent. Nothing crosses on a sum, so there is no threshold either.
  it('sends no window and no threshold, which the API derives or refuses', () => {
    const body = entitlementToUpdateBody(combined);

    expect(body.resetPeriod).toBeUndefined();
    expect(body.resetAnchor).toBeUndefined();
    expect(body.warningThresholdPercent).toBeUndefined();
  });

  it('keeps the units and the visibility of the entitlement', () => {
    const body = entitlementToUpdateBody(combined);

    expect(body.unitSingular).toBe('credit');
    expect(body.unitPlural).toBe('credits');
    expect(body.userFacing).toBe(true);
  });
});

describe('entitlementToUpdateBody, for the other types', () => {
  it('echoes that a number is calculated, and names no source', () => {
    const body = entitlementToUpdateBody(calculated);

    expect(body.usageSource).toBe('CALCULATED_USAGE');
    expect(body).not.toHaveProperty('sources');
  });

  it('echoes the window of a calculated number, as before', () => {
    const body = entitlementToUpdateBody({
      ...calculated,
      resetAnchor: 'CALENDAR',
      resetPeriod: 'MONTH',
    });

    expect(body.resetPeriod).toBe('MONTH');
    expect(body.resetAnchor).toBe('CALENDAR');
  });

  it.each(['BOOLEAN', 'CONFIG'] as const)(
    'says nothing of the usage of a %s entitlement, which has none (the API answers 400 to it)',
    (type) => {
      const body = entitlementToUpdateBody({
        ...calculated,
        type,
        usageSource: undefined,
      });

      expect(body).not.toHaveProperty('usageSource');
      expect(body).not.toHaveProperty('sources');
    },
  );

  it('echoes that a credit pool is calculated', () => {
    expect(
      entitlementToUpdateBody({ ...calculated, type: 'NUMBER_AI_CREDIT' })
        .usageSource,
    ).toBe('CALCULATED_USAGE');
  });
});
