import type { Addon, AddonFamily } from '@/api-client';
import type { AddonGroup } from '../types';

/** Every version of a family, newest first as the API sends them. A family has at least one. */
export const getFamilyVersions = (family: AddonFamily): Addon[] =>
  family.versions ?? [];

/**
 * The version a family is shown under and a new version starts from: the one the
 * API resolves it to, its default or else its newest published one, and, for a
 * family with nothing on sale, the newest version whatever its state. The console
 * applies no resolution rule of its own.
 */
export function getFamilyHead(family: AddonFamily): Addon | undefined {
  return (
    family.currentVersion ??
    [...getFamilyVersions(family)].sort(
      (left, right) => right.version - left.version,
    )[0]
  );
}

/** What a product is called: its head version's name. */
export const getFamilyName = (family: AddonFamily): string =>
  getFamilyHead(family)?.name ?? family.slug;

/** Every version of every family, flat: what the filters of the list run over. */
export const getAllVersions = (families: readonly AddonFamily[]): Addon[] =>
  families.flatMap(getFamilyVersions);

/**
 * The families the filters keep, each with the versions they keep, in the order
 * the API lists the families. A family none of whose versions is kept is not
 * listed; one whose head is filtered out is still named after its head.
 */
export function buildAddonGroups(
  keptVersions: readonly Addon[],
  families: readonly AddonFamily[],
): AddonGroup[] {
  const kept = new Set(keptVersions.map((version) => version.id));

  return families.flatMap((family) => {
    const versions = getFamilyVersions(family).filter((version) =>
      kept.has(version.id),
    );
    if (versions.length === 0) {
      return [];
    }

    return [
      {
        defaultVersion: getFamilyVersions(family).find(
          (version) => version.isDefault,
        ),
        family,
        head: getFamilyHead(family),
        name: getFamilyName(family),
        versions,
      },
    ];
  });
}
