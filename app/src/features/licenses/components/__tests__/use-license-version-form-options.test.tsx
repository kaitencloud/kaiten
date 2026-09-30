import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import type { License, LicenseFamilyView } from '@/api-client';
import { useLicenseVersionFormOptions } from '../forms/use-license-version-form-options';

const makeLicense = ({
  familyId,
  id,
  isDefault = false,
  lifecycleState = 'PUBLISHED',
  name,
  slug,
  version,
  versionName,
}: {
  familyId: string;
  id: string;
  isDefault?: boolean;
  lifecycleState?: License['lifecycleState'];
  name: string;
  slug: string;
  version: string;
  versionName?: string;
}): License =>
  ({
    description: `${name} ${version} description`,
    familyId,
    id,
    isDefault,
    lifecycleState,
    name,
    slug,
    type: 'COMMUNITY',
    version,
    versionName,
  }) as License;

// A family as GET /license-families lists it, resolved to currentVersion by
// the API.
const makeFamily = (
  id: string,
  slug: string,
  currentVersion?: License,
): LicenseFamilyView =>
  ({
    createdAt: '2026-01-01T00:00:00.000Z',
    currentVersion,
    id,
    slug,
    updatedAt: '2026-01-01T00:00:00.000Z',
    versionCount: 1,
  }) as LicenseFamilyView;

const labelsOf = (options: Array<{ familyId: string; label: string }>) =>
  options.map(({ familyId, label }) => ({ familyId, label }));

const communityV1 = makeLicense({
  familyId: 'family-community',
  id: 'community-v1',
  name: 'Community',
  slug: 'community-v1',
  version: '1',
  versionName: 'Legacy',
});
const communityV2 = makeLicense({
  familyId: 'family-community',
  id: 'community-v2',
  isDefault: true,
  name: 'Community',
  slug: 'community-v2',
  version: '2',
  versionName: 'GA',
});
const enterpriseV1 = makeLicense({
  familyId: 'family-enterprise',
  id: 'enterprise-v1',
  name: 'Enterprise',
  slug: 'enterprise-v1',
  version: '1',
  versionName: 'GA',
});

describe('useLicenseVersionFormOptions', () => {
  it('offers the listed families, labelled by the version each resolves to', () => {
    const { result } = renderHook(() =>
      useLicenseVersionFormOptions({
        availableFamilies: [
          makeFamily('family-enterprise', 'enterprise', enterpriseV1),
          makeFamily('family-community', 'community', communityV2),
        ],
        availableLicenses: [communityV2, communityV1, enterpriseV1],
      }),
    );

    expect(labelsOf(result.current.familyOptions)).toEqual([
      { familyId: 'family-community', label: 'Community' },
      { familyId: 'family-enterprise', label: 'Enterprise' },
    ]);
    expect(
      result.current.licensesByFamily
        .get('family-community')
        ?.map((license) => license.slug),
    ).toEqual(['community-v2', 'community-v1']);
  });

  // Two products may share a name: they stay two options, since familyId is
  // what groups versions, and both read that name -- the console shows no slug.
  it('keeps two families that share a name as two options, shown by name only', () => {
    const pro = makeLicense({
      familyId: 'family-pro',
      id: 'pro',
      name: 'Pro',
      slug: 'pro',
      version: '1',
    });
    const otherPro = makeLicense({
      familyId: 'family-other-pro',
      id: 'pro-x7k2',
      name: 'Pro',
      slug: 'pro-x7k2',
      version: '1',
    });
    const starter = makeLicense({
      familyId: 'family-starter',
      id: 'starter',
      name: 'Starter',
      slug: 'starter',
      version: '1',
    });

    const { result } = renderHook(() =>
      useLicenseVersionFormOptions({
        availableFamilies: [
          makeFamily('family-pro', 'pro', pro),
          makeFamily('family-other-pro', 'pro-x7k2', otherPro),
          makeFamily('family-starter', 'starter', starter),
        ],
        availableLicenses: [pro, otherPro, starter],
      }),
    );

    expect(labelsOf(result.current.familyOptions)).toEqual([
      { familyId: 'family-pro', label: 'Pro' },
      { familyId: 'family-other-pro', label: 'Pro' },
      { familyId: 'family-starter', label: 'Starter' },
    ]);
  });

  // A rename does not detach a version from its product: grouping by
  // name would have offered "Community" and "Community Plus" as two families.
  it('keeps a renamed version in its family and labels the family by its current version', () => {
    const renamed = { ...communityV2, name: 'Community Plus' };

    const { result } = renderHook(() =>
      useLicenseVersionFormOptions({
        availableFamilies: [
          makeFamily('family-community', 'community', renamed),
        ],
        availableLicenses: [renamed, communityV1],
      }),
    );

    expect(labelsOf(result.current.familyOptions)).toEqual([
      { familyId: 'family-community', label: 'Community Plus' },
    ]);
    expect(result.current.licensesByFamily.get('family-community')).toHaveLength(
      2,
    );
  });

  // The API resolves the family; the form takes its answer. Here the newest
  // version is a draft, and the family serves v2.
  it('starts a new version from the version the family resolves to', () => {
    const published = { ...communityV2, isDefault: false };
    const draft = makeLicense({
      familyId: 'family-community',
      id: 'community-v3',
      lifecycleState: 'DRAFT',
      name: 'Community Next',
      slug: 'community-v3',
      version: '3',
      versionName: 'Next',
    });

    const { result } = renderHook(() =>
      useLicenseVersionFormOptions({
        availableFamilies: [
          makeFamily('family-community', 'community', published),
        ],
        availableLicenses: [draft, published, communityV1],
      }),
    );

    expect(result.current.familyOptions[0]?.headLicense.slug).toBe(
      'community-v2',
    );
    expect(result.current.initialValues.baseLicenseSlug).toBe('community-v2');
    expect(result.current.initialValues.selectedFamilyId).toBe(
      'family-community',
    );
  });

  // A family with nothing published resolves to no version; it can still be
  // given one, starting from its highest.
  it('starts a family with nothing published from its highest version', () => {
    const draftV1 = { ...communityV1, lifecycleState: 'DRAFT' as const };
    const draftV2 = {
      ...communityV2,
      isDefault: false,
      lifecycleState: 'DRAFT' as const,
    };

    const { result } = renderHook(() =>
      useLicenseVersionFormOptions({
        availableFamilies: [makeFamily('family-community', 'community')],
        availableLicenses: [draftV1, draftV2],
      }),
    );

    expect(labelsOf(result.current.familyOptions)).toEqual([
      { familyId: 'family-community', label: 'Community' },
    ]);
    expect(result.current.initialValues.baseLicenseSlug).toBe('community-v2');
  });

  // The two lists are separate reads. A family whose versions the license
  // list does not have yet offers no base version to start from.
  it('leaves out a family whose versions are not listed yet', () => {
    const { result } = renderHook(() =>
      useLicenseVersionFormOptions({
        availableFamilies: [
          makeFamily('family-community', 'community', communityV2),
          makeFamily('family-enterprise', 'enterprise', enterpriseV1),
        ],
        availableLicenses: [communityV2, communityV1],
      }),
    );

    expect(labelsOf(result.current.familyOptions)).toEqual([
      { familyId: 'family-community', label: 'Community' },
    ]);
  });

  it('keeps the selected family keyed by familyId and leaves the version name for the user when no sibling ends with a number', () => {
    const { result } = renderHook(() =>
      useLicenseVersionFormOptions({
        availableFamilies: [
          makeFamily('family-community', 'community', communityV2),
        ],
        availableLicenses: [communityV2, communityV1],
        selectedLicenseSlug: 'community-v1',
      }),
    );

    expect(result.current.initialValues.selectedFamilyId).toBe(
      'family-community',
    );
    expect(result.current.initialValues.versionName).toBe('');
    expect(result.current.initialValues.baseLicenseSlug).toBe('community-v1');
  });

  it('proposes the next version name of the family instead of the base version name', () => {
    const betaV2 = makeLicense({
      familyId: 'family-beta',
      id: 'beta-v2',
      isDefault: true,
      name: 'Beta Tester',
      slug: 'beta-v2',
      version: '2',
      versionName: 'v2',
    });
    const betaV1 = makeLicense({
      familyId: 'family-beta',
      id: 'beta-v1',
      name: 'Beta Tester',
      slug: 'beta-v1',
      version: '1',
      versionName: 'v1',
    });

    const { result } = renderHook(() =>
      useLicenseVersionFormOptions({
        availableFamilies: [makeFamily('family-beta', 'beta', betaV2)],
        availableLicenses: [betaV2, betaV1],
        selectedLicenseSlug: 'beta-v1',
      }),
    );

    expect(result.current.initialValues.versionName).toBe('v3');
  });
});
