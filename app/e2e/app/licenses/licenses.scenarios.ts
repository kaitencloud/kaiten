import type { License } from '@/api-client';
import { buildLicense } from '../_support/fixtures';
import { LicenseAppModel } from '../_support/model/license-app-model';

const starterVersion = (
  version: number,
  versionName: string,
  lifecycleState: License['lifecycleState'],
  isDefault = false,
) =>
  buildLicense({
    createdAt: `2026-02-0${version}T09:00:00.000Z`,
    description: `Starter plan, ${versionName} release`,
    familyId: 'family-starter',
    id: `license-starter-v${version}`,
    isDefault,
    lifecycleState,
    name: 'Starter',
    // A family takes the slug of the version that opened it, and later
    // versions are slugged after the family.
    slug: version === 1 ? 'starter' : `starter-v${version}`,
    type: 'PAID',
    version: String(version),
    versionName,
  });

/**
 * One family carrying the whole lifecycle: v1 withdrawn, v2 the published
 * default, v3 published, and v4 still being prepared.
 */
export function createLicenseCatalogModel() {
  return new LicenseAppModel({
    licenses: [
      starterVersion(1, 'Legacy', 'ARCHIVED'),
      starterVersion(2, 'GA', 'PUBLISHED', true),
      starterVersion(3, 'Spring', 'PUBLISHED'),
      starterVersion(4, 'Next', 'DRAFT'),
    ],
  });
}

/**
 * A family whose version names end in a number, so the version form suggests
 * the next one ("Starter v3") and comes complete without any edit.
 */
export function createNumberedLicenseFamilyModel() {
  return new LicenseAppModel({
    licenses: [
      starterVersion(1, 'Starter v1', 'PUBLISHED', true),
      starterVersion(2, 'Starter v2', 'PUBLISHED'),
    ],
  });
}
