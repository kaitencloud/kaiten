import { describe, expect, it } from 'vite-plus/test';
import { buildAddon } from '../../../../../e2e/app/_support/fixtures';
import {
  addonFormSchema,
  addonFormValuesToCreateBody,
  addonFormValuesToUpdateBody,
  addonToChangesBody,
  addonToFormValues,
  initialAddonFormValues,
} from '../addon.schema';

const values = (overrides: Partial<ReturnType<typeof initialAddonFormValues>> = {}) => ({
  ...initialAddonFormValues(),
  name: 'Extra seats',
  ...overrides,
});

describe('what the form of a version opens with', () => {
  it('is a new draft, paid, unbounded and named by nothing', () => {
    expect(initialAddonFormValues()).toEqual({
      createAsDraft: true,
      description: '',
      maxQuantity: Number.NaN,
      name: '',
      pricingType: 'PAID',
      slug: '',
      versionName: '',
    });
  });

  it('starts the next version of a family from its name and how it is sold', () => {
    expect(
      initialAddonFormValues({ name: 'Extra seats', pricingType: 'CUSTOM' }),
    ).toMatchObject({ name: 'Extra seats', pricingType: 'CUSTOM' });
  });

  it('is the version as it is when it is an existing one', () => {
    const addon = buildAddon({
      description: 'Five seats',
      familySlug: 'extra-seats',
      maxQuantity: 10,
      name: 'Extra seats',
      slug: 'extra-seats',
      versionName: '2026',
    });

    expect(addonToFormValues(addon)).toEqual({
      createAsDraft: false,
      description: 'Five seats',
      maxQuantity: 10,
      name: 'Extra seats',
      pricingType: 'PAID',
      slug: 'extra-seats',
      versionName: '2026',
    });
    expect(addonToFormValues(buildAddon({ familySlug: 'f', name: 'N', slug: 's' })).maxQuantity).toBeNaN();
  });
});

describe('what a version needs', () => {
  it('is a name, and nothing else: the API names the slug and the version, and leaves the quantity unbounded', () => {
    expect(addonFormSchema.safeParse(values()).success).toBe(true);
    const result = addonFormSchema.safeParse(values({ name: '' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Pages.Addons.Form.Errors.name');
  });

  it('takes a whole number of units from one up, or none', () => {
    for (const quantity of [1, 10, 2_147_483_647, Number.NaN]) {
      expect(addonFormSchema.safeParse(values({ maxQuantity: quantity })).success, String(quantity)).toBe(true);
    }
    for (const quantity of [0, -1, 1.5, 2_147_483_648]) {
      const result = addonFormSchema.safeParse(values({ maxQuantity: quantity }));

      expect(result.success, String(quantity)).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('Pages.Addons.Form.Errors.maxQuantity');
    }
  });
});

describe('the body of a new version', () => {
  it('opens a family as a draft, leaving the slug and the version to the API when they are empty', () => {
    expect(addonFormValuesToCreateBody(values({ description: 'Five seats' }))).toEqual({
      description: 'Five seats',
      familySlug: undefined,
      lifecycleState: 'DRAFT',
      maxQuantity: undefined,
      name: 'Extra seats',
      pricingType: 'PAID',
      slug: undefined,
      versionName: undefined,
    });
  });

  it('sends the slug, the version name and the maximum that were typed, trimmed, and a published version when the person says so', () => {
    expect(
      addonFormValuesToCreateBody(
        values({
          createAsDraft: false,
          maxQuantity: 10,
          name: '  Extra seats ',
          slug: ' extra-seats ',
          versionName: ' 2026 ',
        }),
      ),
    ).toMatchObject({
      lifecycleState: 'PUBLISHED',
      maxQuantity: 10,
      name: 'Extra seats',
      slug: 'extra-seats',
      versionName: '2026',
    });
  });

  it("makes the next version of a family, whose slug is the API's to make", () => {
    const body = addonFormValuesToCreateBody(values({ slug: 'ignored' }), { familySlug: 'extra-seats' });

    expect(body.familySlug).toBe('extra-seats');
    expect(body.slug).toBeUndefined();
  });
});

describe('the body of an update', () => {
  const addon = buildAddon({ familySlug: 'f', isDefault: true, name: 'N', slug: 's' });

  it('says everything, since the API replaces what the version has and clears a member that is left out', () => {
    expect(
      addonFormValuesToUpdateBody(
        values({ description: 'More', maxQuantity: Number.NaN, versionName: '' }),
        addon,
      ),
    ).toEqual({
      description: 'More',
      isDefault: true,
      maxQuantity: undefined,
      name: 'Extra seats',
      versionName: undefined,
    });
  });

  it('keeps the default flag the version has: the action of its row moves it', () => {
    expect(addonFormValuesToUpdateBody(values(), { isDefault: false }).isDefault).toBe(false);
  });

  it('restates a version as it is, with the default flag set as asked', () => {
    const version = buildAddon({
      description: 'Five seats',
      familySlug: 'f',
      maxQuantity: 10,
      name: 'Extra seats',
      slug: 's',
      versionName: '2026',
    });

    expect(addonToChangesBody(version, true)).toEqual({
      description: 'Five seats',
      isDefault: true,
      maxQuantity: 10,
      name: 'Extra seats',
      versionName: '2026',
    });
    expect(addonToChangesBody({ ...version, maxQuantity: undefined }, false).maxQuantity).toBeUndefined();
  });
});
