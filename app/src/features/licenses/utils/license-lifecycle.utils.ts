import type { License } from '@/api-client';
import {
  getVersionTransition,
  isDefaultArchiveBlocked,
  type VersionLifecycleTransition,
} from '@/domains/billing';

export type LicenseLifecycleState = NonNullable<License['lifecycleState']>;

// Optional on the API type -- the same schema is the create body, where the
// state may be omitted -- but always present on a read. Absent means
// published: the state every license had before the field existed, and the
// server's own default on create.
export function getLicenseLifecycleState(
  license: Pick<License, 'lifecycleState'>,
): LicenseLifecycleState {
  return license.lifecycleState ?? 'PUBLISHED';
}

export function isLicensePublished(
  license: Pick<License, 'lifecycleState'>,
): boolean {
  return getLicenseLifecycleState(license) === 'PUBLISHED';
}

// Only a PUBLISHED version may be a family's default: a default is what the
// family resolves to, and an unpublished version is one nothing may serve. The
// API refuses the rest with UpdateLicense.DefaultMustBePublished, so the
// console does not offer the action rather than let the request fail.
export function canBecomeDefault(
  license: Pick<License, 'isDefault' | 'lifecycleState'>,
): boolean {
  return !license.isDefault && isLicensePublished(license);
}

// The operations a version's state moves through. An update cannot change the
// state; each of these moves it along one edge. The rule is the one the versions of
// an add-on follow too, and lives in the billing domain.
export type LicenseLifecycleTransition = VersionLifecycleTransition;

export function getLifecycleTransition(
  license: Pick<License, 'lifecycleState'>,
): LicenseLifecycleTransition {
  return getVersionTransition(getLicenseLifecycleState(license));
}

// A family's default must stay PUBLISHED, so the API refuses to archive it
// (ArchiveLicense.DefaultMustBePublished) until another version takes its
// place or the flag is unset. The console withholds the action and says why.
export function isLifecycleTransitionBlocked(
  license: Pick<License, 'isDefault' | 'lifecycleState'>,
): boolean {
  return isDefaultArchiveBlocked(
    getLicenseLifecycleState(license),
    license.isDefault,
  );
}
