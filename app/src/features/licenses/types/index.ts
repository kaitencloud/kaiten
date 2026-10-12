import type { License } from '@/api-client';

export type LicenseWithInstances = License & {
  nbInstances: number;
};

export type LicenseGroup = {
  // The family's default version, when it has one.
  defaultLicense: License | undefined;
  // The family every version of the group shares: what makes them
  // one product, whatever their names say.
  familyId: string;
  // What the API addresses the family by, which its public listing is written
  // with. Absent for a group whose family the API did not list.
  familySlug: string | undefined;
  // The version the family is shown under and a new version starts from: the
  // one the API resolves the family to, else its highest version.
  headLicense: License | undefined;
  // Whether the family's default published version is listed in the public
  // catalogue. Families are private until listed.
  isPublic: boolean;
  // The name the product is shown under: its head version's.
  licenseName: string;
  licenses: LicenseWithInstances[];
};
