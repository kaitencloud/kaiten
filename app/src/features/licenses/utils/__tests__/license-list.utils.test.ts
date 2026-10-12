import { describe, expect, it } from 'vite-plus/test';
import type { Instance, License, LicenseFamilyView } from '@/api-client';
import type { LicenseWithInstances } from '../../types';
import {
  buildLicenseGroups,
  buildLicensesWithInstancesRows,
  normalizeLicenseFamilyName,
} from '../license-list.utils';

const makeLicense = (id: string, name: string): License =>
  ({
    description: `${name} description`,
    familyId: `family-${id}`,
    id,
    isDefault: false,
    name,
    type: 'PAID',
    version: '1.0.0',
    versionName: `${name} v1`,
  }) as License;

const makeLicenseRow = ({
  familyId,
  id,
  isDefault = false,
  lifecycleState,
  name,
  slug,
  version,
  versionName,
}: {
  familyId?: string;
  id: string;
  isDefault?: boolean;
  lifecycleState?: License['lifecycleState'];
  name: string;
  slug?: string;
  version: string;
  versionName?: string;
}): LicenseWithInstances =>
  ({
    description: `${name} ${version} description`,
    familyId,
    id,
    isDefault,
    lifecycleState,
    name,
    nbInstances: 0,
    slug,
    type: 'PAID',
    version,
    versionName,
  }) as LicenseWithInstances;

// A family as GET /license-families lists it: the version it resolves to is
// the API's answer, which the console takes as given.
const makeFamily = (id: string, currentVersion?: License): LicenseFamilyView =>
  ({
    createdAt: '2026-01-01T00:00:00.000Z',
    currentVersion,
    id,
    slug: id.replace(/^family-/, ''),
    updatedAt: '2026-01-01T00:00:00.000Z',
    versionCount: 1,
  }) as LicenseFamilyView;

const makeInstance = (id: string, licenseId: string): Instance =>
  ({
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: { id: 'user-1', name: 'User 1' },
    customerId: 'customer-1',
    description: 'Instance description',
    endLicenseDate: '2026-12-31T00:00:00.000Z',
    id,
    licenseId,
    name: `Instance ${id}`,
    startLicenseDate: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: { id: 'user-1', name: 'User 1' },
  }) as Instance;

describe('buildLicensesWithInstancesRows', () => {
  it('counts instances per license', () => {
    const licenses = [
      makeLicense('lic-1', 'Enterprise'),
      makeLicense('lic-2', 'Trial'),
    ];

    const instances = [
      makeInstance('inst-1', 'lic-1'),
      makeInstance('inst-2', 'lic-1'),
      makeInstance('inst-4', 'lic-2'),
    ];

    const result = buildLicensesWithInstancesRows(licenses, instances);

    expect(result).toHaveLength(2);
    expect(result[0].nbInstances).toBe(2);
    expect(result[1].nbInstances).toBe(1);
  });

  it('returns 0 instances when a license has no instances', () => {
    const licenses = [makeLicense('lic-1', 'Enterprise')];

    const result = buildLicensesWithInstancesRows(licenses, []);

    expect(result[0].nbInstances).toBe(0);
  });

  it('keeps input license order', () => {
    const licenses = [
      makeLicense('lic-2', 'Second'),
      makeLicense('lic-1', 'First'),
    ];

    const instances = [makeInstance('inst-1', 'lic-1')];

    const result = buildLicensesWithInstancesRows(licenses, instances);

    expect(result.map((item) => item.id)).toEqual(['lic-2', 'lic-1']);
    expect(result.map((item) => item.nbInstances)).toEqual([0, 1]);
  });
});

describe('normalizeLicenseFamilyName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeLicenseFamilyName('  Community  ')).toBe('Community');
  });
});

describe('buildLicenseGroups', () => {
  const communityV1 = makeLicenseRow({
    familyId: 'family-community',
    id: 'community-v1',
    lifecycleState: 'ARCHIVED',
    name: ' Community Legacy ',
    slug: 'community-v1',
    version: '1',
    versionName: 'Legacy',
  });
  const communityV2 = makeLicenseRow({
    familyId: 'family-community',
    id: 'community-v2',
    isDefault: true,
    lifecycleState: 'PUBLISHED',
    name: 'Community',
    slug: 'community-v2',
    version: '2',
    versionName: 'GA',
  });
  const communityV3 = makeLicenseRow({
    familyId: 'family-community',
    id: 'community-v3',
    lifecycleState: 'DRAFT',
    name: 'Community Next',
    slug: 'community-v3',
    version: '3',
    versionName: 'Next',
  });

  // A rename does not detach a version from its product: the family
  // is what groups, and the name is whatever its head version says.
  it('groups versions by family even when their names differ', () => {
    const groups = buildLicenseGroups(
      [communityV1, communityV2],
      [makeFamily('family-community', communityV2)],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.familyId).toBe('family-community');
    expect(groups[0]?.licenseName).toBe('Community');
    expect(groups[0]?.licenses.map((license) => license.id)).toEqual([
      'community-v2',
      'community-v1',
    ]);
  });

  it('keeps separate groups when two families share a name', () => {
    const first = makeLicenseRow({
      familyId: 'family-first',
      id: 'first-v1',
      name: 'Community',
      version: '1',
      versionName: 'GA',
    });
    const second = makeLicenseRow({
      familyId: 'family-second',
      id: 'second-v1',
      name: 'Community',
      version: '1',
      versionName: 'GA',
    });

    const groups = buildLicenseGroups(
      [first, second],
      [makeFamily('family-first', first), makeFamily('family-second', second)],
    );

    expect(groups.map((group) => group.familyId)).toEqual([
      'family-first',
      'family-second',
    ]);
    expect(groups.map((group) => group.licenseName)).toEqual([
      'Community',
      'Community',
    ]);
  });

  // The API resolves the family, and the group takes its answer: the version
  // it names heads the group even where the versions alone would suggest
  // another -- here the newest one is a draft.
  it('heads a family with the version the API resolves it to', () => {
    const current = { ...communityV2, isDefault: false };

    const groups = buildLicenseGroups(
      [communityV3, communityV1, current],
      [makeFamily('family-community', current)],
    );

    expect(groups[0]?.headLicense?.slug).toBe('community-v2');
    expect(groups[0]?.licenseName).toBe('Community');
    expect(groups[0]?.defaultLicense).toBeUndefined();
    expect(groups[0]?.licenses.map((license) => license.version)).toEqual([
      '3',
      '2',
      '1',
    ]);
  });

  // The rows are what the list's filters left; the family is still the one
  // the API describes, so hiding its head version does not rename it.
  it('keeps the family name and default when a filter hides its head version', () => {
    const groups = buildLicenseGroups(
      [communityV1],
      [makeFamily('family-community', communityV2)],
    );

    expect(groups[0]?.licenseName).toBe('Community');
    expect(groups[0]?.headLicense?.slug).toBe('community-v2');
    expect(groups[0]?.defaultLicense?.slug).toBe('community-v2');
    expect(groups[0]?.licenses.map((license) => license.id)).toEqual([
      'community-v1',
    ]);
  });

  it('takes the default from the family it resolves to', () => {
    const groups = buildLicenseGroups(
      [communityV1, communityV2, communityV3],
      [makeFamily('family-community', communityV2)],
    );

    expect(groups[0]?.defaultLicense?.slug).toBe('community-v2');
    expect(groups[0]?.headLicense?.slug).toBe('community-v2');
  });

  // A family with nothing published resolves to no version, and a draft-only
  // product still has to be listed under some name.
  it('lists a family with nothing published under its highest version', () => {
    const groups = buildLicenseGroups(
      [
        { ...communityV1, lifecycleState: 'DRAFT' },
        { ...communityV3, lifecycleState: 'DRAFT' },
      ],
      [makeFamily('family-community')],
    );

    expect(groups[0]?.headLicense?.slug).toBe('community-v3');
    expect(groups[0]?.licenseName).toBe('Community Next');
    expect(groups[0]?.defaultLicense).toBeUndefined();
  });

  // The two lists are separate reads: a version created between them has no
  // family in the family list yet, and is shown until the next read.
  it('lists a family missing from the family list under its highest version', () => {
    const groups = buildLicenseGroups([communityV1, communityV3], []);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.headLicense?.slug).toBe('community-v3');
    expect(groups[0]?.licenseName).toBe('Community Next');
  });

  // The listing in the public catalogue is the family's: the flag and the slug
  // it is written with come from the family list, not from any version.
  it('takes the slug and the public listing from the family the API describes', () => {
    const groups = buildLicenseGroups(
      [communityV2],
      [{ ...makeFamily('family-community', communityV2), isPublic: true }],
    );

    expect(groups[0]?.familySlug).toBe('community');
    expect(groups[0]?.isPublic).toBe(true);
  });

  it('keeps a family private until the API lists it', () => {
    const groups = buildLicenseGroups(
      [communityV2],
      [{ ...makeFamily('family-community', communityV2), isPublic: false }],
    );

    expect(groups[0]?.isPublic).toBe(false);
  });

  it('has no slug to address, and is private, for a family the API did not list', () => {
    const groups = buildLicenseGroups([communityV2], []);

    expect(groups[0]?.familySlug).toBeUndefined();
    expect(groups[0]?.isPublic).toBe(false);
  });

  // familyId is always on a read, but the type leaves it optional (the same
  // schema is the create body). A row without one is its own group rather
  // than merged with strangers.
  it('falls back to the license id for a row without a family', () => {
    const groups = buildLicenseGroups(
      [
        makeLicenseRow({ id: 'orphan-v1', name: 'Orphan', version: '1' }),
        makeLicenseRow({ id: 'orphan-v2', name: 'Orphan', version: '2' }),
      ],
      [],
    );

    expect(groups.map((group) => group.familyId)).toEqual([
      'orphan-v1',
      'orphan-v2',
    ]);
  });
});
