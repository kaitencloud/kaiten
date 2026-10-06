import { z } from 'zod';
import type { License, LicenseFamilyView } from '@/api-client';
import { zLicenseFamilyView } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';

const isPublished = (license: License) =>
  (license.lifecycleState ?? 'PUBLISHED') === 'PUBLISHED';

/**
 * GET /license-families over a set of versions, as the Core API answers it:
 * one entry per family, resolved to its default version, else to its
 * highest-numbered published one, else to none. A family carries the slug of
 * the version that opened it. The console takes this answer as given and never
 * applies the rule itself, so the mocks standing in for the API restate it.
 */
export function listLicenseFamilyViews(
  licenses: License[],
): LicenseFamilyView[] {
  const versionsByFamily = new Map<string, License[]>();
  for (const license of licenses) {
    const familyId = license.familyId ?? license.id;
    versionsByFamily.set(familyId, [
      ...(versionsByFamily.get(familyId) ?? []),
      license,
    ]);
  }

  const families = Array.from(versionsByFamily, ([id, versions]) => {
    const newestFirst = [...versions].sort(
      (left, right) => Number(right.version) - Number(left.version),
    );
    const newest = newestFirst[0];
    // A family is never empty, and its lowest version is the one that opened
    // it.
    const opener = newestFirst[newestFirst.length - 1];
    return {
      createdAt: opener.createdAt,
      currentVersion:
        newestFirst.find((license) => license.isDefault) ??
        newestFirst.find(isPublished),
      id,
      // Families are private until listed; no seed lists one publicly.
      isPublic: false,
      slug: opener.slug ?? id,
      updatedAt: newest.createdAt,
      versionCount: versions.length,
    };
  });

  return parseContract(
    z.array(zLicenseFamilyView),
    structuredClone(families),
    'listLicenseFamilyViews result',
  );
}
