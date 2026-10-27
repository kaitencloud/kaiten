import { z } from 'zod';
import type { License, LicenseFamilyView } from '@/api-client';
import { zLicenseFamilyView } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';

/**
 * The settings of a family that act on its subscriptions, as the API stores them:
 * the family it falls back to (by slug, none without one), what a trial without a
 * payment method becomes at its end, and the lead of the trial reminder. A family
 * that has none stored has the API's defaults.
 */
export type FamilySettings = Pick<
  LicenseFamilyView,
  | 'fallbackLicenseFamilySlug'
  | 'trialEndWithoutPaymentMethod'
  | 'trialReminderDays'
>;

export const DEFAULT_FAMILY_SETTINGS: FamilySettings = {
  fallbackLicenseFamilySlug: null,
  trialEndWithoutPaymentMethod: 'CANCEL',
  trialReminderDays: 3,
};

const isPublished = (license: License) =>
  (license.lifecycleState ?? 'PUBLISHED') === 'PUBLISHED';

/**
 * GET /license-families over a set of versions, as the Core API answers it:
 * one entry per family, resolved to its default version, else to its
 * highest-numbered published one, else to none. A family carries the slug of
 * the version that opened it. The console takes this answer as given and never
 * applies the rule itself, so the mocks standing in for the API restate it.
 * Families are private until listed: `publicFamilyIds` names the ones that are.
 * `settingsByFamilyId` holds the settings that were changed from the defaults.
 */
export function listLicenseFamilyViews(
  licenses: License[],
  publicFamilyIds: ReadonlySet<string> = new Set(),
  settingsByFamilyId: ReadonlyMap<string, FamilySettings> = new Map(),
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
      isPublic: publicFamilyIds.has(id),
      ...(settingsByFamilyId.get(id) ?? DEFAULT_FAMILY_SETTINGS),
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
