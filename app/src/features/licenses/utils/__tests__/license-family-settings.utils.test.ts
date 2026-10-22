import { describe, expect, it } from 'vite-plus/test';
import type { License, LicenseFamilyView } from '@/api-client';
import { NO_FALLBACK } from '../../schemas/license-family-settings.schema';
import {
  getFallbackOptions,
  getFamilyName,
} from '../license-family-settings.utils';

const version = (
  slug: string,
  name: string,
  pricingType: License['pricingType'],
  extra: Partial<License> = {},
): License =>
  ({
    familyId: `family-${slug}`,
    id: `license-${slug}-${extra.version ?? '1'}`,
    isDefault: true,
    name,
    pricingType,
    slug,
    version: '1',
    ...extra,
  }) as License;

const familyOf = (
  slug: string,
  overrides: Partial<LicenseFamilyView> = {},
): LicenseFamilyView =>
  ({
    fallbackLicenseFamilySlug: null,
    id: `family-${slug}`,
    isPublic: false,
    slug,
    trialEndWithoutPaymentMethod: 'CANCEL',
    trialReminderDays: 3,
    versionCount: 1,
    ...overrides,
  }) as LicenseFamilyView;

const licenses = [
  version('pro', 'Pro', 'PAID'),
  version('community', 'Community', 'FREE'),
  version('basic', 'Basic', 'FREE'),
  // Free in one version and sold in another: not a family to fall back to.
  version('mixed', 'Mixed', 'FREE'),
  version('mixed-v2', 'Mixed', 'PAID', {
    familyId: 'family-mixed',
    version: '2',
  }),
  version('custom', 'Custom', 'CUSTOM'),
];
const families = ['pro', 'community', 'basic', 'mixed', 'custom'].map((slug) =>
  familyOf(slug),
);

const options = (family: LicenseFamilyView, overrides = {}) =>
  getFallbackOptions({
    families,
    family,
    licenses,
    noneLabel: 'No fallback',
    ...overrides,
  });

describe('the families a family can fall back to', () => {
  it('are the others whose every version is free, by name, after none', () => {
    expect(options(families[0])).toEqual([
      { label: 'No fallback', value: NO_FALLBACK },
      { label: 'Basic', value: 'basic' },
      { label: 'Community', value: 'community' },
    ]);
  });

  it('never include the family itself', () => {
    expect(
      options(families[1]).map((option) => option.value),
    ).toEqual([NO_FALLBACK, 'basic']);
  });

  it('keep a stored fallback in the list, so that the select says what the family has', () => {
    const family = familyOf('pro', { fallbackLicenseFamilySlug: 'custom' });

    expect(options(family).map((option) => option.value)).toEqual([
      NO_FALLBACK,
      'basic',
      'community',
      'custom',
    ]);
    expect(
      options(familyOf('pro', { fallbackLicenseFamilySlug: 'gone' })).at(-1),
    ).toEqual({ label: 'gone', value: 'gone' });
  });

  it('offer none but the sentinel for a version the list does not price', () => {
    expect(
      getFallbackOptions({
        families,
        family: families[0],
        licenses: [version('community', 'Community', undefined)],
        noneLabel: 'No fallback',
      }),
    ).toEqual([{ label: 'No fallback', value: NO_FALLBACK }]);
  });
});

describe('the name a family is shown under', () => {
  it('is the name of the version it resolves to', () => {
    const family = familyOf('pro', {
      currentVersion: version('pro-v2', 'Pro (renamed)', 'PAID', {
        familyId: 'family-pro',
      }),
    });

    expect(getFamilyName(family, licenses)).toBe('Pro (renamed)');
  });

  it('is the name of its highest version when it resolves to none, and its slug without versions', () => {
    expect(getFamilyName(familyOf('mixed'), licenses)).toBe('Mixed');
    expect(getFamilyName(familyOf('empty'), licenses)).toBe('empty');
  });
});
