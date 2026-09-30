import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import type { License } from '@/api-client';
import {
  formatLicenseOptionLabel,
  getAssignableLicenses,
} from '../instance-license-options.utils';

const makeLicense = (
  slug: string,
  name: string,
  version: string,
  lifecycleState: License['lifecycleState'],
): License =>
  ({
    description: `${name} ${version}`,
    familyId: `family-${name}`,
    id: slug,
    isDefault: false,
    lifecycleState,
    name,
    slug,
    type: 'PAID',
    version,
  }) as License;

// Renders the key with its values, so the assertions show which message was
// picked and what it was given.
const t = ((key: string, values?: Record<string, string>) =>
  `${key.split('.').pop()}(${Object.values(values ?? {}).join('|')})`) as unknown as TFunction;

const premiumV1 = makeLicense('premium-v1', 'Premium', '1', 'ARCHIVED');
const premiumV2 = makeLicense('premium-v2', 'Premium', '2', 'PUBLISHED');
const premiumV3 = makeLicense('premium-v3', 'Premium', '3', 'DRAFT');
const starter = makeLicense('starter', 'Starter', '1', 'PUBLISHED');

describe('getAssignableLicenses', () => {
  it('leaves archived versions out, since the API refuses to assign them', () => {
    const slugs = getAssignableLicenses([
      premiumV1,
      starter,
      premiumV2,
      premiumV3,
    ]).map((license) => license.slug);

    expect(slugs).toEqual(['premium-v3', 'premium-v2', 'starter']);
  });

  it("keeps the instance's own license even once archived", () => {
    const slugs = getAssignableLicenses(
      [premiumV1, premiumV2],
      'premium-v1',
    ).map((license) => license.slug);

    expect(slugs).toEqual(['premium-v2', 'premium-v1']);
  });
});

describe('formatLicenseOptionLabel', () => {
  it('tells versions of one product apart by their number', () => {
    expect(formatLicenseOptionLabel(premiumV2, t)).toBe('label(Premium|2)');
  });

  it('says when a version is a draft or archived', () => {
    expect(formatLicenseOptionLabel(premiumV3, t)).toBe(
      'draft(label(Premium|3))',
    );
    expect(formatLicenseOptionLabel(premiumV1, t)).toBe(
      'archived(label(Premium|1))',
    );
  });
});
