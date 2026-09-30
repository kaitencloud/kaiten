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
  // The version the family is shown under and a new version starts from: the
  // one the API resolves the family to, else its highest version.
  headLicense: License | undefined;
  // The name the product is shown under: its head version's.
  licenseName: string;
  licenses: LicenseWithInstances[];
};
