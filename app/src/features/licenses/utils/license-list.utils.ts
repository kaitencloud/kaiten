import type { Instance, License, LicenseFamilyView } from '@/api-client';
import type { LicenseGroup, LicenseWithInstances } from '../types';

type LicenseWithName = {
  name: string;
};

type LicenseWithFamily = {
  // Optional on the API type -- the same schema is the create body, where a
  // new product has no family yet -- but always populated by the time a
  // license is read back.
  familyId?: string;
  id: string;
};

type LicenseWithVersion = {
  // Optional on the API type (version is server-assigned on create), but
  // always populated by the time a license is read back.
  version?: string;
};

export function normalizeLicenseFamilyName(name: string): string {
  const normalizedName = name.trim();
  return normalizedName || name;
}

// The family is what makes two licenses the same product: the name
// is a display label a version can change without leaving its family, and one
// two families may share. A read always carries familyId; the fallback keeps a
// row without one -- a fixture, or a create response echoed before a refetch --
// in a group of its own rather than merged with strangers.
export function getLicenseFamilyKey(license: LicenseWithFamily): string {
  return license.familyId ?? license.id;
}

export function groupLicensesByFamily<T extends LicenseWithFamily>(
  licenses: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const license of licenses) {
    const familyKey = getLicenseFamilyKey(license);
    groups.set(familyKey, [...(groups.get(familyKey) ?? []), license]);
  }

  return groups;
}

export function sortLicensesByVersionDesc<T extends LicenseWithVersion>(
  licenses: T[],
): T[] {
  return [...licenses].sort((left, right) =>
    (right.version ?? '').localeCompare(left.version ?? '', undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );
}

// The version a family is shown under, and the one a new version of it starts
// from: the version the API resolves the family to (GET /license-families) --
// its default, else its highest published version. The console does not apply
// that rule itself. A family with nothing published resolves to none and still
// has to be listed under some name: its highest version's, then.
export function getFamilyHeadLicense<
  T extends LicenseWithName & LicenseWithVersion,
>(
  family: Pick<LicenseFamilyView, 'currentVersion'> | undefined,
  versions: T[],
): License | T | undefined {
  return family?.currentVersion ?? sortLicensesByVersionDesc(versions)[0];
}

export const buildLicensesWithInstancesRows = (
  licenses: License[],
  instances: Instance[],
): LicenseWithInstances[] => {
  const instanceCountByLicenseId = new Map<string, number>();

  for (const instance of instances) {
    instanceCountByLicenseId.set(
      instance.licenseId,
      (instanceCountByLicenseId.get(instance.licenseId) ?? 0) + 1,
    );
  }

  return licenses.map((license) => ({
    ...license,
    nbInstances: instanceCountByLicenseId.get(license.id) ?? 0,
  }));
};

// The rows are the versions left by the list's filters; what a group says
// about its family -- its name, its default, where a new version starts --
// comes from the family itself, so a filter hiding the head version does not
// rename the product.
export const buildLicenseGroups = (
  licenses: LicenseWithInstances[],
  families: LicenseFamilyView[],
): LicenseGroup[] => {
  const familiesById = new Map(families.map((family) => [family.id, family]));

  return Array.from(groupLicensesByFamily(licenses).entries())
    .map(([familyId, groupedLicenses]) => {
      const sortedLicenses = sortLicensesByVersionDesc(groupedLicenses);
      const family = familiesById.get(familyId);
      const headLicense = getFamilyHeadLicense(family, sortedLicenses);
      return {
        // A family resolves to its default whenever it has one.
        defaultLicense: family?.currentVersion?.isDefault
          ? family.currentVersion
          : undefined,
        familyId,
        headLicense,
        licenseName: normalizeLicenseFamilyName(headLicense?.name ?? ''),
        licenses: sortedLicenses,
      };
    })
    .sort((left, right) => left.licenseName.localeCompare(right.licenseName));
};
