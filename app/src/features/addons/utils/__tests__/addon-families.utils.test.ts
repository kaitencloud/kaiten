import { describe, expect, it } from 'vite-plus/test';
import type { Addon, AddonFamily } from '@/api-client';
import { buildAddon } from '../../../../../e2e/app/_support/fixtures';
import {
  buildAddonGroups,
  getAllVersions,
  getFamilyHead,
  getFamilyName,
  getFamilyVersions,
} from '../addon-families.utils';

const seatsV1 = buildAddon({
  familySlug: 'extra-seats',
  isDefault: true,
  name: 'Extra seats',
  slug: 'extra-seats',
  versionName: '2026',
});
const seatsV2 = buildAddon({
  familySlug: 'extra-seats',
  lifecycleState: 'DRAFT',
  name: 'Extra seats (next)',
  slug: 'extra-seats-v2',
  version: 2,
  versionName: '2027',
});
const storageV1 = buildAddon({
  familySlug: 'extra-storage',
  lifecycleState: 'ARCHIVED',
  name: 'Extra storage',
  slug: 'extra-storage',
});

const family = (
  slug: string,
  versions: Addon[] | null,
  currentVersion?: Addon,
): AddonFamily => ({
  currentVersion,
  id: `addon-family-${slug}`,
  isPublic: false,
  lastVersion: Math.max(0, ...(versions ?? []).map(({ version }) => version)),
  slug,
  versions,
});

describe('a family of add-ons', () => {
  it('has the versions the API sends, none when it sends null', () => {
    expect(getFamilyVersions(family('extra-seats', [seatsV2, seatsV1]))).toEqual([
      seatsV2,
      seatsV1,
    ]);
    expect(getFamilyVersions(family('extra-seats', null))).toEqual([]);
  });

  it('is shown under the version the API resolves it to, and the console applies no rule of its own', () => {
    expect(getFamilyHead(family('extra-seats', [seatsV2, seatsV1], seatsV1))).toBe(seatsV1);
  });

  it('is shown under its newest version when nothing is on sale', () => {
    // Listed oldest first: the newest is still the head.
    expect(getFamilyHead(family('extra-storage', [storageV1, { ...storageV1, version: 2, slug: 'extra-storage-v2' }]))?.version).toBe(2);
  });

  it('has no head when it has no version', () => {
    expect(getFamilyHead(family('extra-seats', []))).toBeUndefined();
  });

  it('is named after its head, else by its slug', () => {
    expect(getFamilyName(family('extra-seats', [seatsV2, seatsV1], seatsV1))).toBe('Extra seats');
    expect(getFamilyName(family('extra-seats', []))).toBe('extra-seats');
  });
});

describe('the families the filters keep', () => {
  const families = [
    family('extra-seats', [seatsV2, seatsV1], seatsV1),
    family('extra-storage', [storageV1]),
  ];

  it('lists every version of every family, flat', () => {
    expect(getAllVersions(families).map(({ slug }) => slug)).toEqual([
      'extra-seats-v2',
      'extra-seats',
      'extra-storage',
    ]);
  });

  it('keeps each family with the versions the filters kept, in the order the API lists the families', () => {
    const groups = buildAddonGroups([storageV1, seatsV1], families);

    expect(groups.map(({ family: { slug } }) => slug)).toEqual(['extra-seats', 'extra-storage']);
    expect(groups[0]?.versions.map(({ slug }) => slug)).toEqual(['extra-seats']);
  });

  it('leaves out a family none of whose versions is kept', () => {
    expect(buildAddonGroups([storageV1], families).map(({ name }) => name)).toEqual([
      'Extra storage',
    ]);
    expect(buildAddonGroups([], families)).toEqual([]);
  });

  it('keeps naming a family after its head when the filters left the head out', () => {
    const [group] = buildAddonGroups([seatsV2], families);

    expect(group?.name).toBe('Extra seats');
    expect(group?.head).toBe(seatsV1);
    expect(group?.defaultVersion).toBe(seatsV1);
    expect(group?.versions).toEqual([seatsV2]);
  });
});
