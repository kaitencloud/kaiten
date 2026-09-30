import { z } from 'zod';
import type { LicenseWritable, License } from '@/api-client';

// The new version's number is not collected: POST /licenses assigns the next
// one in the family server-side. Which family is the base license's own, named
// by familyId -- sending the name alone would open a second product
// under that name instead of adding a version to this one, and the API accepts
// that silently: two products may share a name, so nothing refuses it.
export const licenseVersionFormSchema = z.object({
  baseLicenseSlug: z
    .string()
    .min(1, 'Pages.Licenses.Version.Form.Errors.baseLicenseRequired'),
  baseVersion: z.string().optional(),
  // The state the new version starts in; it moves through publish, archive
  // and unarchive afterwards.
  createAsDraft: z.boolean(),
  description: z.string(),
  selectedFamilyId: z
    .string()
    .min(1, 'Pages.Licenses.Version.Form.Errors.licenseNameRequired'),
  versionName: z.string().optional(),
});

export type LicenseVersionFormValues = z.infer<typeof licenseVersionFormSchema>;

// lifecycleState is the state the version ends in: useLicenseSave creates it
// as a draft and publishes it once its grants are attached.
export function licenseVersionFormValuesToLicenseInput(
  values: LicenseVersionFormValues,
  baseLicense: License,
): LicenseWritable {
  return {
    description: values.description,
    familyId: baseLicense.familyId,
    isDefault: false,
    lifecycleState: values.createAsDraft ? 'DRAFT' : 'PUBLISHED',
    name: baseLicense.name,
    type: baseLicense.type,
    versionName: values.versionName,
  };
}

export function sortLicensesByDefaultThenVersion(licenses: License[]) {
  return [...licenses].sort((left, right) => {
    if (left.isDefault && !right.isDefault) {
      return -1;
    }
    if (!left.isDefault && right.isDefault) {
      return 1;
    }

    // version is optional on the API type (server-assigned on create), but
    // always populated by the time a license is read back.
    return (right.version ?? '').localeCompare(left.version ?? '', undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}
